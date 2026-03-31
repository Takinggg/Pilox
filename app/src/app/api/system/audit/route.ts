import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { purgeOldAuditLogs } from "@/lib/audit-retention";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { sql } from "drizzle-orm";
import { withHttpServerSpan } from "@/lib/otel-http-route";

/**
 * GET /api/system/audit — Audit log stats (admin only)
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/system/audit", async () => {
  const authResult = await authorize("admin");
  if (!authResult.authorized) return authResult.response;

  try {
    const retentionDays = parseInt(process.env.AUDIT_RETENTION_DAYS || "90");
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const [[{ total }], [{ expirable }], [{ oldest }]] = await Promise.all([
      db.select({ total: sql<number>`count(*)::int` }).from(auditLogs),
      db.select({ expirable: sql<number>`count(*)::int` }).from(auditLogs)
        .where(sql`${auditLogs.createdAt} < ${cutoff}`),
      db.select({ oldest: sql<string>`min(${auditLogs.createdAt})::text` }).from(auditLogs),
    ]);

    return NextResponse.json({
      totalEntries: total,
      expirableEntries: expirable,
      retentionDays,
      oldestEntry: oldest,
    });
  } catch {
    return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to fetch audit stats", 500);
  }
  });
}

/**
 * DELETE /api/system/audit — Purge old audit logs (admin only)
 */
export async function DELETE(req: Request) {
  return withHttpServerSpan(req, "DELETE /api/system/audit", async () => {
  const authResult = await authorize("admin");
  if (!authResult.authorized) return authResult.response;

  try {
    const deleted = await purgeOldAuditLogs();

    // Log the purge itself
    await db.insert(auditLogs).values({
      userId: authResult.user.id,
      action: "audit.purge",
      resource: "audit_logs",
      details: { deletedCount: deleted },
      ipAddress: authResult.ip,
    });

    return NextResponse.json({ deleted });
  } catch {
    return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to purge audit logs", 500);
  }
  });
}
