import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { env } from "@/lib/env";
import { db } from "@/db";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-utils";

/**
 * Unauthenticated liveness for load balancers / orchestrators.
 * Shallow: always 200 { ok: true } if the Node process responds.
 * Deep: when HEALTH_CHECK_DEEP=true, also runs SELECT 1 (503 if DB unreachable).
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/health", async () => {
    const ip = await getClientIp();
    const rl = await checkRateLimit(ip, "health");
    if (!rl.allowed) return rateLimitResponse(rl);

    const e = env();

    if (!e.HEALTH_CHECK_DEEP) {
      return NextResponse.json(
        { ok: true },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    try {
      await db.execute(sql`SELECT 1`);
      return NextResponse.json(
        { ok: true },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    } catch {
      return NextResponse.json(
        { ok: false },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }
  });
}
