/**
 * A2A server wiring for the Pilox Next app (Next.js Node runtime).
 *
 * The executor routes incoming A2A tasks to real agent containers
 * running on this Pilox node. It resolves the target agent from DB,
 * forwards the user message via the agent's chat endpoint, and
 * streams the response back through the A2A event bus.
 */
import { randomUUID } from "node:crypto";
import { PiloxA2AServer } from "@pilox/a2a-sdk";
import type { AgentCard, PiloxServerConfig, Message, Part, TaskStatusUpdateEvent } from "@pilox/a2a-sdk";
import type {
  AgentExecutor,
  ExecutionEventBus,
  RequestContext,
  TaskStore,
} from "@pilox/a2a-sdk/server";
import { InMemoryTaskStore } from "@pilox/a2a-sdk/server";
import { env } from "@/lib/env";
import { RedisTaskStore } from "@/lib/a2a/redis-task-store";
import { buildA2ACryptoFromEnv } from "@/lib/a2a/key-material";
import { createA2ARedisRateLimitMiddleware } from "@/lib/a2a/redis-rate-limit-middleware";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { resolveAgentBaseUrl, resolveAgentChatFormat } from "@/lib/agent-port";
import { recordInferenceUsage } from "@/lib/inference-meter";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("a2a.executor");

const GLOBAL_A2A_SERVER = Symbol.for("pilox.__piloxA2AServer");

type A2AServerHolder = { server?: PiloxA2AServer };

function a2aServerHolder(): A2AServerHolder {
  const g = globalThis as typeof globalThis & Record<symbol, A2AServerHolder>;
  if (!g[GLOBAL_A2A_SERVER]) {
    g[GLOBAL_A2A_SERVER] = {};
  }
  return g[GLOBAL_A2A_SERVER]!;
}

function textFromParts(parts: Part[] | undefined): string {
  if (!parts?.length) return "";
  return parts
    .filter((p): p is Part & { kind: "text"; text: string } => p.kind === "text")
    .map((p) => p.text)
    .join("\n")
    .slice(0, 8000);
}

/**
 * Find a ready/running agent to handle A2A requests.
 * Tries to match by skill ID first, then falls back to any ready agent.
 */
async function resolveTargetAgent(
  skillId?: string,
): Promise<typeof agents.$inferSelect | null> {
  const aliveStatuses = ["running", "ready"] as const;

  // If a skill ID is provided, try to find an agent with matching config
  if (skillId) {
    const allAlive = await db
      .select()
      .from(agents)
      .where(inArray(agents.status, [...aliveStatuses]))
      .limit(50);

    for (const agent of allAlive) {
      const config = (agent.config ?? {}) as Record<string, unknown>;
      const a2a = config.a2a as { skills?: Array<{ id: string }> } | undefined;
      if (a2a?.skills?.some((s) => s.id === skillId)) {
        return agent;
      }
    }
  }

  // Fallback: return first ready/running agent
  const [agent] = await db
    .select()
    .from(agents)
    .where(inArray(agents.status, [...aliveStatuses]))
    .limit(1);

  return agent ?? null;
}

function createPiloxPlatformExecutor(taskStore: TaskStore): AgentExecutor {
  return {
    async execute(requestContext: RequestContext, eventBus: ExecutionEventBus) {
      const incoming = textFromParts(requestContext.userMessage.parts);

      // Find a target agent to handle this request
      const targetAgent = await resolveTargetAgent();

      if (!targetAgent || !targetAgent.instanceIp) {
        const reply: Message = {
          kind: "message",
          role: "agent",
          messageId: randomUUID(),
          parts: [
            {
              kind: "text",
              text: "No agent is currently available to handle this request. Please start an agent first.",
            },
          ],
          taskId: requestContext.taskId,
          contextId: requestContext.contextId,
        };
        eventBus.publish(reply);
        eventBus.finished();
        return;
      }

      log.info("a2a.executor.dispatch", {
        taskId: requestContext.taskId,
        targetAgent: targetAgent.id,
        agentName: targetAgent.name,
        inputLength: incoming.length,
      });

      // Forward the message to the agent's chat endpoint
      const baseUrl = resolveAgentBaseUrl(targetAgent);
      const chatFormat = resolveAgentChatFormat(targetAgent);
      const config = (targetAgent.config ?? {}) as Record<string, unknown>;
      const modelCfg = config.model as { name?: string } | undefined;
      const model = modelCfg?.name ?? "llama3.2";

      const chatUrl =
        chatFormat === "openai"
          ? `${baseUrl}/v1/chat/completions`
          : `${baseUrl}/api/chat`;

      const startTime = Date.now();

      try {
        const chatRes = await fetch(chatUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: incoming }],
            stream: false,
          }),
          signal: AbortSignal.timeout(300_000),
        });

        if (!chatRes.ok) {
          const errText = await chatRes.text().catch((err) => {
            log.warn("Failed to read upstream agent chat error body", { err });
            return "";
          });
          const reply: Message = {
            kind: "message",
            role: "agent",
            messageId: randomUUID(),
            parts: [
              {
                kind: "text",
                text: `Agent error (${chatRes.status}): ${errText.slice(0, 500)}`,
              },
            ],
            taskId: requestContext.taskId,
            contextId: requestContext.contextId,
          };
          eventBus.publish(reply);
          eventBus.finished();
          return;
        }

        const json = await chatRes.json() as Record<string, unknown>;
        const durationMs = Date.now() - startTime;

        // Extract response text based on format
        let responseText: string;
        let tokensIn = 0;
        let tokensOut = 0;

        if (chatFormat === "openai") {
          // OpenAI format: { choices: [{ message: { content: "..." } }], usage: { ... } }
          const choices = json.choices as Array<{ message?: { content?: string } }> | undefined;
          responseText = choices?.[0]?.message?.content ?? "(no response)";
          const usage = json.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
          tokensIn = usage?.prompt_tokens ?? 0;
          tokensOut = usage?.completion_tokens ?? 0;
        } else {
          // Ollama format: { message: { content: "..." }, prompt_eval_count, eval_count }
          const msg = json.message as { content?: string } | undefined;
          responseText = msg?.content ?? "(no response)";
          tokensIn = (json.prompt_eval_count as number) ?? 0;
          tokensOut = (json.eval_count as number) ?? 0;
        }

        // Record usage
        void recordInferenceUsage({
          agentId: targetAgent.id,
          model,
          tokensIn,
          tokensOut,
          durationMs,
        });

        const reply: Message = {
          kind: "message",
          role: "agent",
          messageId: randomUUID(),
          parts: [{ kind: "text", text: responseText }],
          taskId: requestContext.taskId,
          contextId: requestContext.contextId,
        };
        eventBus.publish(reply);
        eventBus.finished();
      } catch (err) {
        log.error("a2a.executor.error", {
          taskId: requestContext.taskId,
          targetAgent: targetAgent.id,
          error: err instanceof Error ? err.message : String(err),
        });

        const reply: Message = {
          kind: "message",
          role: "agent",
          messageId: randomUUID(),
          parts: [
            {
              kind: "text",
              text: `Failed to reach agent: ${err instanceof Error ? err.message : "unknown error"}`,
            },
          ],
          taskId: requestContext.taskId,
          contextId: requestContext.contextId,
        };
        eventBus.publish(reply);
        eventBus.finished();
      }
    },

    async cancelTask(taskId: string, eventBus: ExecutionEventBus) {
      const task = await taskStore.load(taskId);
      const contextId = task?.contextId ?? "";
      const ev: TaskStatusUpdateEvent = {
        kind: "status-update",
        taskId,
        contextId,
        final: true,
        status: {
          state: "canceled",
          timestamp: new Date().toISOString(),
          message: {
            kind: "message",
            role: "agent",
            messageId: randomUUID(),
            parts: [{ kind: "text", text: "Task canceled." }],
            taskId,
            contextId,
          },
        },
      };
      eventBus.publish(ev);
      eventBus.finished();
    },
  };
}

function buildAgentCard(baseUrl: string): AgentCard {
  const root = baseUrl.replace(/\/$/, "");
  const jsonRpcUrl = `${root}/api/a2a/jsonrpc`;
  return {
    name: "Pilox Platform",
    description:
      "A2A gateway for the Pilox agent platform. Routes tasks to locally running agent containers.",
    version: "1.0.0",
    protocolVersion: "0.3.0",
    url: jsonRpcUrl,
    preferredTransport: "JSONRPC",
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    skills: [
      {
        id: "pilox.chat",
        name: "Chat",
        description: "Send a message to a Pilox-hosted agent and receive a response.",
        tags: ["pilox", "chat", "agent"],
      },
    ],
  };
}

/**
 * Lazily constructs the Pilox-wrapped A2A server (middleware, signing, Noise extensions on card).
 * Stored on `globalThis` so duplicate module evaluation (e.g. bundler edge cases) shares one instance.
 */
export function getPiloxA2AServer(): PiloxA2AServer {
  const holder = a2aServerHolder();
  if (holder.server) return holder.server;

  const e = env();
  const taskStore =
    e.A2A_TASK_STORE === "redis"
      ? new RedisTaskStore(e.A2A_TASK_TTL_SECONDS)
      : new InMemoryTaskStore();

  const agentCard = buildAgentCard(e.AUTH_URL);
  const agentExecutor = createPiloxPlatformExecutor(taskStore);
  const crypto = buildA2ACryptoFromEnv({
    signingSecretHex: e.A2A_SIGNING_SECRET_KEY_HEX,
    noiseStaticSecretHex: e.A2A_NOISE_STATIC_SECRET_KEY_HEX,
  });
  if (Boolean(crypto.signing) !== Boolean(crypto.noise)) {
    throw new Error(
      "A2A: set both A2A_SIGNING_SECRET_KEY_HEX and A2A_NOISE_STATIC_SECRET_KEY_HEX, or omit both for ephemeral keys."
    );
  }

  const rl = {
    windowMs: e.A2A_RATE_LIMIT_WINDOW_MS,
    maxRequests: e.A2A_RATE_LIMIT_MAX,
    keyPrefix: "pilox:rl:a2a",
  };

  const config: PiloxServerConfig = {
    agentCard,
    agentExecutor,
    taskStore,
    rateLimit: false,
    middleware: [createA2ARedisRateLimitMiddleware(rl)],
  };

  if (crypto.signing) config.signing = crypto.signing;
  if (crypto.noise) config.noise = crypto.noise;
  if (!e.A2A_SDK_AUDIT_ENABLED) config.audit = false;
  if (!e.A2A_SDK_CIRCUIT_BREAKER_ENABLED) config.circuitBreaker = false;

  holder.server = new PiloxA2AServer(config);
  return holder.server;
}
