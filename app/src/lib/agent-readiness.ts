/**
 * Background readiness probe for agent containers.
 *
 * After an agent is started, this polls its HTTP endpoint until it responds,
 * then transitions the DB status from "running" → "ready".
 * Uses exponential backoff starting at 1s, capped at 10s.
 */

import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveAgentBaseUrl, resolveAgentHealthPath } from "./agent-port";
import { isAllowedAgentIP } from "./agent-network-guard";
import { publishAgentStatus } from "./redis";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("readiness");

interface AgentLike {
  id: string;
  image: string;
  instanceId: string | null;
  instanceIp: string | null;
  port?: number | null;
  config?: unknown;
}

export async function pollAgentReadiness(
  agent: AgentLike,
  opts?: { maxAttempts?: number; intervalMs?: number; correlationId?: string },
): Promise<boolean> {
  const maxAttempts = opts?.maxAttempts ?? 90; // ~3 min max with backoff
  const baseInterval = opts?.intervalMs ?? 1000;

  if (!agent.instanceIp) {
    log.warn("readiness.no_ip", { agentId: agent.id });
    return false;
  }

  if (!isAllowedAgentIP(agent.instanceIp)) {
    log.error("readiness.invalid_ip", {
      agentId: agent.id,
      instanceIp: agent.instanceIp,
    });
    return false;
  }

  const baseUrl = resolveAgentBaseUrl(agent);
  const healthPath = resolveAgentHealthPath(agent);
  const url = `${baseUrl}${healthPath}`;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.status >= 200 && res.status < 400) {
        await db
          .update(agents)
          .set({ status: "ready", updatedAt: new Date() })
          .where(eq(agents.id, agent.id));

        if (agent.instanceId) {
          await publishAgentStatus(
            {
              agentId: agent.id,
              status: "ready",
              timestamp: new Date().toISOString(),
              instanceId: agent.instanceId,
            },
            { correlationId: opts?.correlationId },
          );
        }

        log.info("readiness.agent_ready", {
          agentId: agent.id,
          attempts: i + 1,
          url,
        });
        return true;
      }
    } catch {
      // Not ready yet — expected during container boot
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, capped at 10s
    const delay = Math.min(baseInterval * Math.pow(2, Math.min(i, 3)), 10_000);
    await new Promise((r) => setTimeout(r, delay));
  }

  log.warn("readiness.timeout", {
    agentId: agent.id,
    maxAttempts,
    url,
  });
  return false;
}
