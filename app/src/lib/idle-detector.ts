/**
 * Idle Detector — Auto-pause agents that have been idle too long.
 *
 * Checks every 30s for running agents with no recent inference activity.
 * Activity is tracked by the vsock proxy via Redis key:
 *   pilox:agent:activity:{agentId} = timestamp (TTL 600s)
 *
 * If a running agent has no activity for > IDLE_THRESHOLD_S, it's paused
 * via the hypervisor backend (Firecracker or Cloud Hypervisor), freeing CPU.
 * Memory stays resident — resume is near-instant on next request.
 */

import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { pauseInstance } from "./runtime";
import { getRedis, publishAgentStatus, publishSystemEvent, cacheInvalidate } from "./redis";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("idle-detector");

const CHECK_INTERVAL_MS = 30_000; // 30s
const DEFAULT_IDLE_THRESHOLD_S = 300; // 5 minutes

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Start the idle detector loop.
 * Call once at app startup. Idempotent — calling again is a no-op.
 */
export function startIdleDetector(): void {
  if (intervalHandle) return;

  const thresholdS = parseInt(process.env.AUTO_SLEEP_IDLE_SECONDS || String(DEFAULT_IDLE_THRESHOLD_S));
  const enabled = process.env.AUTO_SLEEP_ENABLED !== "false";

  if (!enabled) {
    log.info("Idle detector disabled via AUTO_SLEEP_ENABLED=false");
    return;
  }

  log.info("Starting idle detector", { thresholdSeconds: thresholdS, checkIntervalMs: CHECK_INTERVAL_MS });

  intervalHandle = setInterval(() => {
    checkIdleAgents(thresholdS).catch((err) => {
      log.error("Idle detector error", { error: err instanceof Error ? err.message : String(err) });
    });
  }, CHECK_INTERVAL_MS);
}

/**
 * Stop the idle detector. Call on app shutdown.
 */
export function stopIdleDetector(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    log.info("Idle detector stopped");
  }
}

async function checkIdleAgents(thresholdS: number): Promise<void> {
  // Get all running agents from DB
  const runningAgents = await db
    .select({ id: agents.id, name: agents.name, instanceId: agents.instanceId })
    .from(agents)
    .where(eq(agents.status, "running"));

  if (runningAgents.length === 0) return;

  const r = getRedis();
  if (r.status !== "ready") await r.connect();

  const now = Date.now();

  for (const agent of runningAgents) {
    if (!agent.instanceId) continue;

    try {
      // Check last activity timestamp from Redis (set by the proxy)
      const lastActivityStr = await r.get(`pilox:agent:activity:${agent.id}`);
      const lastActivity = lastActivityStr ? parseInt(lastActivityStr) : 0;
      const idleMs = now - lastActivity;

      // If no activity record exists, use a grace period from now
      // (agent may have just started and not made any requests yet)
      if (!lastActivityStr) {
        // Set initial activity timestamp so we don't immediately pause new agents
        await r.set(`pilox:agent:activity:${agent.id}`, String(now), "EX", thresholdS * 2);
        continue;
      }

      if (idleMs > thresholdS * 1000) {
        log.info("Auto-pausing idle agent", {
          agentId: agent.id,
          name: agent.name,
          idleSeconds: Math.round(idleMs / 1000),
        });

        await pauseInstance(agent.instanceId);

        await db
          .update(agents)
          .set({ status: "paused", updatedAt: new Date() })
          .where(eq(agents.id, agent.id));

        // Set paused flag for proxy auto-resume (TTL 24h, prevents orphans)
        await r.set(`pilox:agent:paused:${agent.id}`, "1", "EX", 86400);

        await publishAgentStatus({
          agentId: agent.id,
          status: "paused",
          timestamp: new Date().toISOString(),
          instanceId: agent.instanceId,
        });
        await publishSystemEvent({
          type: "agent.paused",
          payload: { agentId: agent.id, name: agent.name, reason: "idle" },
          timestamp: new Date().toISOString(),
        });
        await cacheInvalidate("system:stats");
      }
    } catch (err) {
      log.error("Failed to auto-pause agent", {
        agentId: agent.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
