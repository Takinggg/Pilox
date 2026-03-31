import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { desc, sql, eq, ilike, or, and } from "drizzle-orm";

export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/users", async () => {
  const authResult = await authorize("admin");
  if (!authResult.authorized) return authResult.response;

  const url = new URL(req.url);
  const rawLimit = parseInt(url.searchParams.get("limit") || "50");
  const rawOffset = parseInt(url.searchParams.get("offset") || "0");
  if (isNaN(rawLimit) || isNaN(rawOffset) || rawLimit < 1 || rawOffset < 0) {
    return errorResponse(ErrorCode.INVALID_INPUT, "Invalid limit or offset", 400);
  }
  const limit = Math.min(rawLimit, 100);
  const offset = rawOffset;

  // Optional filters
  const search = url.searchParams.get("search")?.trim();
  const roleFilter = url.searchParams.get("role");
  const statusFilter = url.searchParams.get("status"); // "active" | "deactivated"

  const conditions = [];
  if (search) {
    // Escape LIKE wildcards to prevent pattern injection
    const escaped = search.replace(/[%_\\]/g, "\\$&");
    conditions.push(or(
      ilike(users.name, `%${escaped}%`),
      ilike(users.email, `%${escaped}%`),
    ));
  }
  if (roleFilter && ["admin", "operator", "viewer"].includes(roleFilter)) {
    conditions.push(eq(users.role, roleFilter as "admin" | "operator" | "viewer"));
  }
  if (statusFilter === "active") {
    conditions.push(sql`${users.deactivatedAt} IS NULL`);
  } else if (statusFilter === "deactivated") {
    conditions.push(sql`${users.deactivatedAt} IS NOT NULL`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        avatarUrl: users.avatarUrl,
        lastLoginAt: users.lastLoginAt,
        deactivatedAt: users.deactivatedAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(users).where(where),
  ]);

  return NextResponse.json({
    data: rows,
    pagination: { total: count, limit, offset },
  });
  });
}
