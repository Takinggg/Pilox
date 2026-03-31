// SPDX-License-Identifier: BUSL-1.1
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("audit");

interface AuditEntry {
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Write an audit log entry. Fire-and-forget — never throws.
 * Use this instead of inline `db.insert(auditLogs).values(...)` to avoid
 * duplicating error handling across every API route.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values(entry);
  } catch (err) {
    log.error("audit_write_failed", {
      action: entry.action,
      resource: entry.resource,
      userId: entry.userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Write audit log inside an existing transaction.
 */
export async function writeAuditLogInTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  entry: AuditEntry,
): Promise<void> {
  await tx.insert(auditLogs).values(entry);
}
