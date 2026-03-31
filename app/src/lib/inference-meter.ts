/**
 * Inference usage metering — tracks token consumption and cost per agent.
 *
 * Records to both `inference_usage` (per-request log) and updates
 * aggregate counters on the `agents` table (totalTokensIn/Out).
 * Both operations run in a single transaction for consistency.
 *
 * Budget enforcement uses Redis daily counters + monthly DB aggregates.
 */

import { db } from "@/db";
import { agents, inferenceUsage } from "@/db/schema";
import { eq, sql, and, gte } from "drizzle-orm";
import { postJsonWithSsrfGuard } from "./egress-ssrf-guard";
import { createModuleLogger } from "./logger";
import { getRedis } from "./redis";

const log = createModuleLogger("inference-meter");

export interface InferenceUsageRecord {
  agentId: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
}

export interface InferenceUsageRecordWithCost extends InferenceUsageRecord {
  costUsd: number;
  providerType: string;
}

/**
 * Record a single inference usage event atomically.
 * Fire-and-forget — errors are logged but never thrown.
 */
export async function recordInferenceUsage(
  record: InferenceUsageRecord,
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      // Insert detailed usage row
      await tx.insert(inferenceUsage).values({
        agentId: record.agentId,
        model: record.model,
        tokensIn: record.tokensIn,
        tokensOut: record.tokensOut,
        durationMs: record.durationMs,
      });

      // Update aggregate counters on agent (same transaction)
      if (record.tokensIn > 0 || record.tokensOut > 0) {
        await tx
          .update(agents)
          .set({
            totalTokensIn: sql`${agents.totalTokensIn} + ${record.tokensIn}`,
            totalTokensOut: sql`${agents.totalTokensOut} + ${record.tokensOut}`,
            lastActiveAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(agents.id, record.agentId));
      }
    });
  } catch (err) {
    log.warn("inference_meter.record_failed", {
      agentId: record.agentId,
      model: record.model,
      tokensIn: record.tokensIn,
      tokensOut: record.tokensOut,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Record inference usage with cost tracking and Redis budget counter updates.
 * Fire-and-forget — errors are logged but never thrown.
 */
export async function recordInferenceUsageWithCost(
  record: InferenceUsageRecordWithCost,
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await tx.insert(inferenceUsage).values({
        agentId: record.agentId,
        model: record.model,
        tokensIn: record.tokensIn,
        tokensOut: record.tokensOut,
        durationMs: record.durationMs,
        costUsd: String(record.costUsd),
        providerType: record.providerType,
      });

      if (record.tokensIn > 0 || record.tokensOut > 0) {
        await tx
          .update(agents)
          .set({
            totalTokensIn: sql`${agents.totalTokensIn} + ${record.tokensIn}`,
            totalTokensOut: sql`${agents.totalTokensOut} + ${record.tokensOut}`,
            lastActiveAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(agents.id, record.agentId));
      }
    });

    // Update Redis daily token counter
    const totalTokens = record.tokensIn + record.tokensOut;
    if (totalTokens > 0) {
      try {
        const redis = getRedis();
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const key = `pilox:budget:daily:${record.agentId}:${today}`;
        await redis.incrby(key, totalTokens);
        // TTL: expire at end of day (max 25h)
        await redis.expire(key, 90000);
      } catch (e) {
        log.warn("Redis budget counter update failed (non-fatal)", {
          agentId: record.agentId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Check budget alert threshold (80%)
    void checkBudgetAlert(record.agentId).catch((e) => {
      log.warn("Budget alert check failed", {
        agentId: record.agentId,
        error: e instanceof Error ? e.message : String(e),
      });
    });
  } catch (err) {
    log.warn("inference_meter.record_with_cost_failed", {
      agentId: record.agentId,
      costUsd: record.costUsd,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Budget Checking ──────────────────────────────────

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
}

interface AgentBudgetInfo {
  id: string;
  budgetMaxTokensDay: number | null;
  budgetMaxCostMonth: string | null;
  budgetAlertWebhook: string | null;
}

/**
 * Check if an agent has remaining budget for a new request.
 * Returns { allowed: true } if no budget limits are set.
 */
export async function checkBudget(
  agent: AgentBudgetInfo,
): Promise<BudgetCheckResult> {
  // No budget limits → always allowed
  if (!agent.budgetMaxTokensDay && !agent.budgetMaxCostMonth) {
    return { allowed: true };
  }

  // Check daily token limit via Redis
  if (agent.budgetMaxTokensDay && agent.budgetMaxTokensDay > 0) {
    try {
      const redis = getRedis();
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const key = `pilox:budget:daily:${agent.id}:${today}`;
      const used = parseInt(await redis.get(key) ?? "0", 10);

      if (used >= agent.budgetMaxTokensDay) {
        return {
          allowed: false,
          reason: `Daily token budget exceeded: ${used}/${agent.budgetMaxTokensDay} tokens used today`,
        };
      }
    } catch {
      // Redis unavailable — allow the request (fail-open)
      log.warn("budget.redis_unavailable", { agentId: agent.id });
    }
  }

  // Check monthly cost limit via DB aggregate
  if (agent.budgetMaxCostMonth) {
    const maxCost = parseFloat(agent.budgetMaxCostMonth);
    if (maxCost > 0) {
      try {
        const firstOfMonth = new Date();
        firstOfMonth.setDate(1);
        firstOfMonth.setHours(0, 0, 0, 0);

        const [result] = await db
          .select({
            totalCost: sql<string>`COALESCE(SUM(${inferenceUsage.costUsd}), 0)`,
          })
          .from(inferenceUsage)
          .where(
            and(
              eq(inferenceUsage.agentId, agent.id),
              gte(inferenceUsage.createdAt, firstOfMonth),
            ),
          );

        const currentCost = parseFloat(result?.totalCost ?? "0");
        if (currentCost >= maxCost) {
          return {
            allowed: false,
            reason: `Monthly cost budget exceeded: $${currentCost.toFixed(2)}/$${maxCost.toFixed(2)} used this month`,
          };
        }
      } catch {
        // DB query failure — allow the request (fail-open)
        log.warn("budget.db_query_failed", { agentId: agent.id });
      }
    }
  }

  return { allowed: true };
}

/**
 * Fire webhook alert at 80% budget threshold.
 */
async function checkBudgetAlert(agentId: string): Promise<void> {
  const [agent] = await db
    .select({
      budgetMaxTokensDay: agents.budgetMaxTokensDay,
      budgetMaxCostMonth: agents.budgetMaxCostMonth,
      budgetAlertWebhook: agents.budgetAlertWebhook,
    })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent?.budgetAlertWebhook) return;

  let alertTriggered = false;
  let alertMessage = "";

  // Check daily 80% threshold
  if (agent.budgetMaxTokensDay && agent.budgetMaxTokensDay > 0) {
    try {
      const redis = getRedis();
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const key = `pilox:budget:daily:${agentId}:${today}`;
      const alertSentKey = `pilox:budget:alert:daily:${agentId}:${today}`;

      const [used, alreadySent] = await Promise.all([
        redis.get(key),
        redis.get(alertSentKey),
      ]);

      const usedTokens = parseInt(used ?? "0", 10);
      const threshold = agent.budgetMaxTokensDay * 0.8;

      if (usedTokens >= threshold && !alreadySent) {
        alertTriggered = true;
        alertMessage = `Daily token budget at ${Math.round((usedTokens / agent.budgetMaxTokensDay) * 100)}%: ${usedTokens}/${agent.budgetMaxTokensDay}`;
        await redis.set(alertSentKey, "1", "EX", 90000);
      }
    } catch { /* non-fatal */ }
  }

  if (alertTriggered && agent.budgetAlertWebhook) {
    try {
      const pr = await postJsonWithSsrfGuard(
        agent.budgetAlertWebhook,
        {
          type: "budget_alert",
          agentId,
          message: alertMessage,
          timestamp: new Date().toISOString(),
        },
        { timeoutMs: 5000, maxResponseBytes: 32_768 },
      );
      if (!pr.ok) {
        log.warn("budget.alert_webhook_blocked_or_failed", {
          agentId,
          error: pr.error,
        });
      }
    } catch (err) {
      log.warn("budget.alert_webhook_failed", {
        agentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
