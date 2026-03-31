/**
 * Agent health watchdog — detects crashed/dead containers and updates DB status.
 *
 * Runs periodically (default every 30s) to reconcile DB state with actual
 * container state. If an agent is "running"/"ready" in DB but its container
 * is dead/exited, transitions it to "error".
 */

import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { listRunningVMs } from "./runtime";
import { publishAgentStatus, getRedis } from "./redis";
import { distributedLockAcquire, distributedLockRelease } from "./redis";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("watchdog");

const WATCHDOG_INTERVAL_MS = 30_000; // 30s
let watchdogTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Single reconciliation pass: find agents whose DB status disagrees with
 * their actual container/VM state and fix them.
 */
export async function reconcileAgentHealth(): Promise<{
  fixed: string[];
  errors: string[];
}> {
  const fixed: string[] = [];
  const errors: string[] = [];

  // Distributed lock prevents concurrent reconciliation across replicas
  let lockToken: string | null = null;
  try {
    lockToken = await distributedLockAcquire("watchdog:reconcile", 60);
  } catch {
    // Redis unavailable — skip this pass
    return { fixed, errors };
  }
  if (!lockToken) {
    // Another replica is reconciling
    return { fixed, errors };
  }

  try {
    // Get all agents that DB thinks are alive
    const aliveAgents = await db
      .select({
        id: agents.id,
        name: agents.name,
        status: agents.status,
        instanceId: agents.instanceId,
        instanceIp: agents.instanceIp,
      })
      .from(agents)
      .where(inArray(agents.status, ["running", "ready", "pulling"]));

    if (aliveAgents.length === 0) return { fixed, errors };

    // Get actual running VMs/containers
    const runningVMs = await listRunningVMs();
    const runningSet = new Set(runningVMs.map((vm) => vm.vmId));
    const pausedSet = new Set(
      runningVMs.filter((vm) => vm.status === "paused").map((vm) => vm.vmId),
    );

    for (const agent of aliveAgents) {
      if (!agent.instanceId) {
        // No instance ever created — shouldn't be "running"
        try {
          await db
            .update(agents)
            .set({ status: "error", updatedAt: new Date() })
            .where(eq(agents.id, agent.id));
          fixed.push(agent.id);
          log.warn("watchdog.orphan_no_instance", {
            agentId: agent.id,
            name: agent.name,
            dbStatus: agent.status,
          });
        } catch (err) {
          errors.push(`${agent.id}: ${err instanceof Error ? err.message : "unknown"}`);
        }
        continue;
      }

      if (pausedSet.has(agent.instanceId)) {
        // Container is paused but DB says running — fix DB
        if (agent.status !== "paused") {
          try {
            await db
              .update(agents)
              .set({ status: "paused", updatedAt: new Date() })
              .where(eq(agents.id, agent.id));
            fixed.push(agent.id);
          } catch (err) {
            errors.push(`${agent.id}: ${err instanceof Error ? err.message : "unknown"}`);
          }
        }
        continue;
      }

      if (!runningSet.has(agent.instanceId)) {
        // Container is dead but DB says running — mark as error
        try {
          await db
            .update(agents)
            .set({ status: "error", updatedAt: new Date() })
            .where(eq(agents.id, agent.id));

          await publishAgentStatus({
            agentId: agent.id,
            status: "stopped",
            timestamp: new Date().toISOString(),
            instanceId: agent.instanceId,
          });

          // Clean up Redis keys
          const r = getRedis();
          if (r.status !== "ready") await r.connect();
          await r.del(
            `pilox:agent:activity:${agent.id}`,
            `pilox:vm:instance:${agent.instanceId}`,
          );

          fixed.push(agent.id);
          log.warn("watchdog.container_dead", {
            agentId: agent.id,
            name: agent.name,
            instanceId: agent.instanceId,
            dbStatus: agent.status,
          });
        } catch (err) {
          errors.push(`${agent.id}: ${err instanceof Error ? err.message : "unknown"}`);
        }
      }
    }
  } catch (err) {
    log.error("watchdog.reconcile_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    errors.push(`reconcile: ${err instanceof Error ? err.message : "unknown"}`);
  } finally {
    // Always release the distributed lock — even on early return or throw
    try {
      await distributedLockRelease("watchdog:reconcile", lockToken);
    } catch {
      // Lock will auto-expire via TTL
    }
  }

  if (fixed.length > 0) {
    log.info("watchdog.reconcile_complete", {
      fixed: fixed.length,
      errors: errors.length,
    });
  }

  return { fixed, errors };
}

/** Start the periodic watchdog. Safe to call multiple times (idempotent). */
export function startWatchdog(): void {
  if (watchdogTimer) return;

  log.info("watchdog.started", { intervalMs: WATCHDOG_INTERVAL_MS });

  // Initial run after 10s delay (let the app boot)
  setTimeout(() => void reconcileAgentHealth(), 10_000);

  watchdogTimer = setInterval(() => {
    void reconcileAgentHealth();
  }, WATCHDOG_INTERVAL_MS);

  // Don't prevent Node from exiting
  if (watchdogTimer.unref) watchdogTimer.unref();
}

/** Stop the watchdog. */
export function stopWatchdog(): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
    log.info("watchdog.stopped");
  }
}
