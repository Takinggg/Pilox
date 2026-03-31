import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-utils";
import { withHttpServerSpan } from "@/lib/otel-http-route";

/**
 * GET /api/setup/status
 * Returns only a boolean — no details about admin existence or user counts.
 * Rate-limited to prevent enumeration.
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/setup/status", async () => {
  const ip = await getClientIp();
  const rl = await checkRateLimit(ip, "api");
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);

    return NextResponse.json({ setupComplete: count > 0 });
  } catch {
    return NextResponse.json({ setupComplete: false });
  }
  });
}
