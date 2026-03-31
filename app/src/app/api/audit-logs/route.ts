import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { desc, eq, and, gte, lte, sql } from "drizzle-orm";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("api.audit-logs");

export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/audit-logs", async () => {
  const authResult = await authorize("admin");
  if (!authResult.authorized) return authResult.response;

  const url = new URL(req.url);
  const rawLimit = parseInt(url.searchParams.get("limit") || "50");
  const rawOffset = parseInt(url.searchParams.get("offset") || "0");
  if (isNaN(rawLimit) || isNaN(rawOffset) || rawLimit < 1 || rawOffset < 0) {
    return NextResponse.json({ error: "Invalid limit or offset" }, { status: 400 });
  }
  const limit = Math.min(rawLimit, 100);
  const offset = rawOffset;
  const action = url.searchParams.get("action");
  const userId = url.searchParams.get("userId");
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");

  // Validate UUID format for userId filter
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (userId && !UUID_REGEX.test(userId)) {
    return NextResponse.json({ error: "Invalid userId format" }, { status: 400 });
  }

  // Validate date formats
  if (startDate && isNaN(new Date(startDate).getTime())) {
    return NextResponse.json({ error: "Invalid startDate format" }, { status: 400 });
  }
  if (endDate && isNaN(new Date(endDate).getTime())) {
    return NextResponse.json({ error: "Invalid endDate format" }, { status: 400 });
  }

  try {
    // Build filter conditions
    const conditions = [];

    if (action) {
      conditions.push(eq(auditLogs.action, action));
    }
    if (userId) {
      conditions.push(eq(auditLogs.userId, userId));
    }
    if (startDate) {
      conditions.push(gte(auditLogs.createdAt, new Date(startDate)));
    }
    if (endDate) {
      conditions.push(lte(auditLogs.createdAt, new Date(endDate)));
    }

    const whereClause =
      conditions.length > 0 ? and(...conditions) : undefined;

    const logs = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        resource: auditLogs.resource,
        resourceId: auditLogs.resourceId,
        details: auditLogs.details,
        ipAddress: auditLogs.ipAddress,
        createdAt: auditLogs.createdAt,
        userId: auditLogs.userId,
        userName: users.name,
        userEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(whereClause)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(whereClause);

    return NextResponse.json({
      data: logs,
      pagination: {
        total: count,
        limit,
        offset,
      },
    });
  } catch (error) {
    log.error("Audit log query failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to retrieve audit logs" },
      { status: 500 }
    );
  }
  });
}
