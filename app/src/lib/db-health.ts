// SPDX-License-Identifier: BUSL-1.1
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("db-health");

/**
 * Check if the database is reachable.
 * Returns { ok, latencyMs, error? }
 */
export async function checkDbHealth(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn("db_health_check_failed", { error: msg, latencyMs: Date.now() - start });
    return { ok: false, latencyMs: Date.now() - start, error: msg };
  }
}

/**
 * Execute a DB operation with retry logic.
 * Retries up to `maxRetries` times with exponential backoff.
 */
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  opts: { maxRetries?: number; label?: string } = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 3;
  const label = opts.label ?? "db_operation";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      const isLast = attempt === maxRetries;
      const msg = err instanceof Error ? err.message : String(err);
      const isConnectionError = msg.includes("ECONNREFUSED") || msg.includes("ETIMEDOUT") || msg.includes("connection");

      if (isLast || !isConnectionError) {
        throw err;
      }

      const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
      log.warn("db_retry", { label, attempt: attempt + 1, maxRetries, delay, error: msg });
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error("Unreachable");
}
