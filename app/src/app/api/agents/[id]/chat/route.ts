import { authorize } from "@/lib/authorize";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { findOwnedAgent } from "@/lib/agent-ownership";
import { resolveAgentBaseUrl } from "@/lib/agent-port";
import { isAllowedAgentIP } from "@/lib/agent-network-guard";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import {
  recordInferenceUsage,
  recordInferenceUsageWithCost,
  checkBudget,
} from "@/lib/inference-meter";
import { persistChatMessages, ensureConversation } from "@/lib/chat-persistence";
import { getTypedConfig } from "@/lib/agent-config-migrate";
import { filterChatMessages } from "@/lib/content-filter";
import {
  checkRequestRateLimit,
  checkTokenRateLimit,
  recordTokenUsageForRateLimit,
} from "@/lib/rate-limiter";
import { routeLlmRequest, getProviderResponseFormat } from "@/lib/llm-router";
import { db } from "@/db";
import { llmProviders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("api.agents.chat");

const chatRequestSchema = z.object({
  model: z.string().min(1).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string(),
      }),
    )
    .min(1)
    .max(200),
  stream: z.boolean().default(true),
  conversationId: z.string().uuid().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withHttpServerSpan(req, "POST /api/agents/[id]/chat", async () => {
    const authResult = await authorize("viewer");
    if (!authResult.authorized) return authResult.response;

    const { id } = await params;
    const agent = await findOwnedAgent(id, authResult.user.id, authResult.role);

    if (!agent) return errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);
    if (!agent.instanceIp || !agent.instanceId) {
      return errorResponse(ErrorCode.INVALID_INPUT, "Agent has no running instance", 400);
    }
    if (!["running", "ready"].includes(agent.status)) {
      return errorResponse(ErrorCode.INVALID_INPUT, `Agent is ${agent.status}`, 400);
    }
    if (!isAllowedAgentIP(agent.instanceIp)) {
      return errorResponse(ErrorCode.INVALID_INPUT, "Agent IP is not in an allowed network range", 403);
    }

    // Parse typed config
    const config = getTypedConfig(agent.config);

    // Budget enforcement
    const budgetResult = await checkBudget({
      id: agent.id,
      budgetMaxTokensDay: agent.budgetMaxTokensDay,
      budgetMaxCostMonth: agent.budgetMaxCostMonth,
      budgetAlertWebhook: agent.budgetAlertWebhook,
    });
    if (!budgetResult.allowed) {
      return errorResponse(ErrorCode.RATE_LIMITED, budgetResult.reason ?? "Budget exceeded", 429);
    }

    // Per-agent rate limiting (Redis sliding window)
    const reqRateResult = await checkRequestRateLimit(
      agent.id,
      config.guardrails?.rateLimitRequestsPerMin,
    );
    if (!reqRateResult.allowed) {
      return errorResponse(ErrorCode.RATE_LIMITED, reqRateResult.reason ?? "Rate limit exceeded", 429);
    }

    const tokRateResult = await checkTokenRateLimit(
      agent.id,
      config.guardrails?.rateLimitTokensPerMin,
    );
    if (!tokRateResult.allowed) {
      return errorResponse(ErrorCode.RATE_LIMITED, tokRateResult.reason ?? "Token rate limit exceeded", 429);
    }

    const bodyResult = await readJsonBodyLimited(req, 256_000);
    if (!bodyResult.ok) {
      return errorResponse(ErrorCode.INVALID_INPUT, "Invalid request body", bodyResult.status);
    }

    let data: z.infer<typeof chatRequestSchema>;
    try {
      data = chatRequestSchema.parse(bodyResult.value);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return errorResponse(ErrorCode.VALIDATION_FAILED, "Validation failed", 400, err.issues);
      }
      return errorResponse(ErrorCode.INVALID_INPUT, "Invalid request", 400);
    }

    // Content filter
    const filterLevel = config.guardrails?.contentFilter ?? "none";
    if (filterLevel !== "none") {
      const filterResult = filterChatMessages(data.messages, filterLevel);
      if (!filterResult.allowed) {
        return errorResponse(ErrorCode.VALIDATION_FAILED, filterResult.reason ?? "Content blocked", 400);
      }
    }

    // Load LLM provider if configured
    let provider = null;
    if (agent.llmProviderId) {
      const [p] = await db
        .select()
        .from(llmProviders)
        .where(eq(llmProviders.id, agent.llmProviderId))
        .limit(1);
      if (p?.enabled) provider = p;
    }

    // Resolve model — request > config > provider default > fallback
    const model = data.model || config.llm?.model || "llama3.2";

    // Build messages with system prompt prepended
    let messages = [...data.messages];
    if (config.llm?.systemPrompt) {
      const hasSystemMsg = messages[0]?.role === "system";
      if (!hasSystemMsg) {
        messages = [{ role: "system" as const, content: config.llm.systemPrompt }, ...messages];
      }
    }

    // Apply guardrails — maxTokensPerRequest
    const maxTokens = config.guardrails?.maxTokensPerRequest ?? config.llm?.maxTokens;

    const startTime = Date.now();

    // Eagerly create/verify conversation
    let conversationId: string | undefined;
    try {
      const lastUserMsg = data.messages[data.messages.length - 1];
      conversationId = await ensureConversation({
        agentId: id,
        userId: authResult.user.id,
        conversationId: data.conversationId,
        firstMessage: lastUserMsg?.content ?? "",
      });
    } catch (err) {
      log.warn("Failed to ensure conversation", {
        agentId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const baseUrl = resolveAgentBaseUrl(agent);

    try {
      // Route through provider or local container
      const routeResult = await routeLlmRequest(
        provider,
        config,
        {
          model,
          messages,
          stream: data.stream,
          temperature: config.llm?.temperature,
          topP: config.llm?.topP,
          maxTokens,
          frequencyPenalty: config.llm?.frequencyPenalty,
          presencePenalty: config.llm?.presencePenalty,
          stopSequences: config.llm?.stopSequences,
        },
        baseUrl,
      );

      const upstream = routeResult.response;
      const responseFormat = provider
        ? getProviderResponseFormat(provider.type)
        : (config.runtime?.chatFormat === "openai" ? "openai-sse" : "ollama-ndjson");

      if (!upstream.ok) {
        const text = await upstream.text().catch((err) => {
          log.warn("Failed to read upstream error body", {
            agentId: id,
            error: err instanceof Error ? err.message : String(err),
          });
          return "";
        });
        return errorResponse(
          ErrorCode.SERVICE_UNAVAILABLE,
          `Agent returned ${upstream.status}: ${text.slice(0, 500)}`,
          502,
        );
      }

      if (!data.stream || !upstream.body) {
        // Non-streaming response
        const json = await upstream.json();
        const durationMs = Date.now() - startTime;

        const { tIn, tOut, content: assistantContent } = extractNonStreamResponse(json, responseFormat);

        const costUsd = tIn * routeResult.costPerInputToken + tOut * routeResult.costPerOutputToken;

        if (routeResult.providerType !== "local" && costUsd > 0) {
          void recordInferenceUsageWithCost({
            agentId: id, model, tokensIn: tIn, tokensOut: tOut, durationMs,
            costUsd, providerType: routeResult.providerType,
          });
        } else {
          void recordInferenceUsage({ agentId: id, model, tokensIn: tIn, tokensOut: tOut, durationMs });
        }

        // Record for per-agent rate limiting
        void recordTokenUsageForRateLimit(id, tIn + tOut);

        const lastUserMsg = data.messages[data.messages.length - 1];
        if (lastUserMsg && assistantContent && conversationId) {
          void persistChatMessages({
            agentId: id, userId: authResult.user.id, conversationId,
            userContent: lastUserMsg.content, assistantContent, model,
            tokensIn: tIn, tokensOut: tOut, durationMs,
          });
        }

        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (conversationId) headers["X-Conversation-Id"] = conversationId;
        return new Response(JSON.stringify(json), { status: 200, headers });
      }

      // Streaming response
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let totalTokensOut = 0;
      let accumulatedContent = "";
      const lastUserMsg = data.messages[data.messages.length - 1];
      // 5-minute idle timeout per chunk — prevents hanging on dead upstream
      const STREAM_READ_TIMEOUT_MS = 300_000;

      const stream = new ReadableStream({
        async pull(controller) {
          try {
            const readPromise = reader.read();
            let timer: ReturnType<typeof setTimeout> | undefined;
            const timeoutPromise = new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error("stream_read_timeout")), STREAM_READ_TIMEOUT_MS);
            });
            let result: ReadableStreamReadResult<Uint8Array>;
            try {
              result = await Promise.race([readPromise, timeoutPromise]);
            } finally {
              clearTimeout(timer);
            }
            const { done, value } = result;
            if (done) {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();

              const durationMs = Date.now() - startTime;
              const costUsd = totalTokensOut * routeResult.costPerOutputToken;

              if (routeResult.providerType !== "local" && costUsd > 0) {
                void recordInferenceUsageWithCost({
                  agentId: id, model, tokensIn: 0, tokensOut: totalTokensOut,
                  durationMs, costUsd, providerType: routeResult.providerType,
                });
              } else {
                void recordInferenceUsage({
                  agentId: id, model, tokensIn: 0, tokensOut: totalTokensOut, durationMs,
                });
              }

              // Record for per-agent rate limiting
              void recordTokenUsageForRateLimit(id, totalTokensOut);

              if (lastUserMsg && accumulatedContent && conversationId) {
                void persistChatMessages({
                  agentId: id, userId: authResult.user.id, conversationId,
                  userContent: lastUserMsg.content, assistantContent: accumulatedContent,
                  model, tokensIn: 0, tokensOut: totalTokensOut, durationMs,
                });
              }
              return;
            }

            const text = decoder.decode(value, { stream: true });

            if (responseFormat === "anthropic-sse") {
              for (const line of text.split("\n")) {
                if (!line.trim() || line.startsWith("event:")) continue;
                if (line.startsWith("data: ")) {
                  controller.enqueue(encoder.encode(`${line}\n\n`));
                  try {
                    const chunk = JSON.parse(line.slice(6));
                    if (chunk.type === "content_block_delta" && chunk.delta?.text) {
                      accumulatedContent += chunk.delta.text;
                      totalTokensOut++;
                    }
                  } catch { /* skip */ }
                }
              }
            } else if (responseFormat === "openai-sse") {
              for (const line of text.split("\n")) {
                if (!line.trim()) continue;
                if (line.startsWith("data: ")) {
                  controller.enqueue(encoder.encode(`${line}\n\n`));
                  if (line !== "data: [DONE]") {
                    try {
                      const chunk = JSON.parse(line.slice(6));
                      const delta = chunk.choices?.[0]?.delta?.content;
                      if (delta) {
                        accumulatedContent += delta;
                        totalTokensOut++;
                      }
                    } catch { /* skip */ }
                  }
                } else {
                  controller.enqueue(encoder.encode(`data: ${line}\n\n`));
                }
              }
            } else {
              // Ollama NDJSON → SSE
              for (const line of text.split("\n")) {
                if (!line.trim()) continue;
                controller.enqueue(encoder.encode(`data: ${line}\n\n`));
                try {
                  const json = JSON.parse(line);
                  if (json.message?.content) {
                    accumulatedContent += json.message.content;
                  }
                } catch { /* skip */ }
                totalTokensOut++;
              }
            }
          } catch (streamErr) {
            log.warn("Stream read error", {
              agentId: id,
              error: streamErr instanceof Error ? streamErr.message : String(streamErr),
            });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          }
        },
        cancel() { reader.cancel(); },
      });

      const streamHeaders: Record<string, string> = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      };
      if (conversationId) streamHeaders["X-Conversation-Id"] = conversationId;

      return new Response(stream, { headers: streamHeaders });
    } catch {
      return errorResponse(
        ErrorCode.SERVICE_UNAVAILABLE,
        "Failed to reach agent instance",
        502,
      );
    }
  });
}

function extractNonStreamResponse(
  json: unknown,
  format: string,
): { tIn: number; tOut: number; content: string | undefined } {
  const obj = json as Record<string, unknown>;

  if (format === "anthropic-sse") {
    const usage = obj.usage as { input_tokens?: number; output_tokens?: number } | undefined;
    const content = (obj.content as Array<{ text?: string }> | undefined)?.[0]?.text;
    return { tIn: usage?.input_tokens ?? 0, tOut: usage?.output_tokens ?? 0, content };
  }

  if (format === "openai-sse") {
    const usage = obj.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
    const content = (obj.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content;
    return { tIn: usage?.prompt_tokens ?? 0, tOut: usage?.completion_tokens ?? 0, content };
  }

  // Ollama
  const ollamaTokens = obj as { prompt_eval_count?: number; eval_count?: number };
  const content = (obj.message as { content?: string } | undefined)?.content;
  return { tIn: ollamaTokens.prompt_eval_count ?? 0, tOut: ollamaTokens.eval_count ?? 0, content };
}
