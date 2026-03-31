/**
 * Token Sync — Periodically flush token counters from Redis to PostgreSQL.
 *
 * The vsock proxy tracks per-agent token usage in Redis hashes:
 *   pilox:agent:tokens:{agentId} = { input: N, output: N, last_model: "..." }
 *
 * Every 60s, this daemon:
 *   1. Reads all token counters from Redis
 *   2. Inserts rows into inference_usage table
 *   3. Increments agents.totalTokensIn/Out
 *   4. Resets Redis counters to 0
 */

import { db } from "@/db";
import { agents, inferenceUsage } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  applyInferenceUsageDebitInTx,
  computeUsageChargeMinor,
  getBillingUsageMinorPer1kTokens,
} from "@/lib/billing/inference-usage-billing";
import { getRedis, scanKeys } from "./redis";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("token-sync");

const SYNC_INTERVAL_MS = 60_000; // 1 minute

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startTokenSync(): void {
  if (intervalHandle) return;

  const enabled = process.env.TOKEN_TRACKING !== "false";
  if (!enabled) {
    log.info("Token sync disabled via TOKEN_TRACKING=false");
    return;
  }

  log.info("Starting token sync daemon", { intervalMs: SYNC_INTERVAL_MS });

  intervalHandle = setInterval(() => {
    syncTokens().catch((err) => {
      log.error("Token sync error", { error: err instanceof Error ? err.message : String(err) });
    });
  }, SYNC_INTERVAL_MS);
}

export function stopTokenSync(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    log.info("Token sync stopped");
  }
}

async function syncTokens(): Promise<void> {
  const r = getRedis();
  if (r.status !== "ready") await r.connect();

  // Find all token counter keys (SCAN, non-blocking)
  const keys = await scanKeys("pilox:agent:tokens:*");
  if (keys.length === 0) return;

  for (const key of keys) {
    const agentId = key.replace("pilox:agent:tokens:", "");
    if (!agentId) continue;

    try {
      // Atomic read + reset via HGETALL then DEL
      const counters = await r.hgetall(key);
      const tokensIn = parseInt(counters.input || "0");
      const tokensOut = parseInt(counters.output || "0");
      const model = counters.last_model || "unknown";

      if (tokensIn === 0 && tokensOut === 0) continue;

      const usageRate = getBillingUsageMinorPer1kTokens();

      await db.transaction(async (tx) => {
        const [usageRow] = await tx
          .insert(inferenceUsage)
          .values({
            agentId,
            model,
            tokensIn,
            tokensOut,
          })
          .returning({ id: inferenceUsage.id });

        await tx
          .update(agents)
          .set({
            totalTokensIn: sql`COALESCE(${agents.totalTokensIn}, 0) + ${tokensIn}`,
            totalTokensOut: sql`COALESCE(${agents.totalTokensOut}, 0) + ${tokensOut}`,
            lastActiveAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(agents.id, agentId));

        if (!usageRow?.id) return;

        if (usageRate > 0) {
          const [agentRow] = await tx
            .select({ createdBy: agents.createdBy })
            .from(agents)
            .where(eq(agents.id, agentId))
            .limit(1);
          const ownerId = agentRow?.createdBy;
          if (ownerId) {
            const chargeMinor = computeUsageChargeMinor(tokensIn, tokensOut, usageRate);
            if (chargeMinor > 0) {
              await applyInferenceUsageDebitInTx(tx, {
                userId: ownerId,
                inferenceUsageId: usageRow.id,
                agentId,
                tokensIn,
                tokensOut,
                model,
                chargeMinor,
              });
            }
          }
        }
      });

      // Clear Redis only after DB commit (retry sync if transaction failed)
      await r.del(key);

      log.info("Synced tokens", { agentId, tokensIn, tokensOut, model });
    } catch (err) {
      log.error("Failed to sync tokens for agent", {
        agentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
