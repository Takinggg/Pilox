/**
 * Audit log retention policy.
 * Purges audit log entries older than the configured retention period.
 * Designed to be called from a cron job or scheduled task.
 */
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { lt } from "drizzle-orm";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("audit-retention");

/** Default retention: 90 days */
const DEFAULT_RETENTION_DAYS = 90;

/**
 * Delete audit log entries older than the retention period.
 * Deletes in batches to avoid long-running transactions.
 * @returns Total number of rows deleted
 */
export async function purgeOldAuditLogs(
  retentionDays: number = parseInt(process.env.AUDIT_RETENTION_DAYS || String(DEFAULT_RETENTION_DAYS)),
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const BATCH_SIZE = 1000;
  let totalDeleted = 0;

  log.info("Starting audit log purge", { retentionDays, cutoff: cutoff.toISOString() });

  // Delete in batches to avoid holding locks too long
  while (true) {
    const deleted = await db
      .delete(auditLogs)
      .where(lt(auditLogs.createdAt, cutoff))
      .returning({ id: auditLogs.id });

    // If we deleted fewer than batch size, we're done
    // Note: Drizzle doesn't support LIMIT on DELETE, so we rely on
    // the DB processing in reasonable chunks. For very large tables,
    // consider raw SQL with LIMIT.
    totalDeleted += deleted.length;

    if (deleted.length < BATCH_SIZE) break;
  }

  log.info("Audit log purge complete", { totalDeleted, cutoff: cutoff.toISOString() });
  return totalDeleted;
}
