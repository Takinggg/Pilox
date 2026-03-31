import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { getRedis } from "@/lib/redis";
import { checkRateLimit, rateLimitResponse, rateLimitHeaders } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-utils";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { withHttpServerSpan } from "@/lib/otel-http-route";

const forgotSchema = z.object({
  email: z.string().email(),
});

/**
 * POST /api/auth/forgot-password
 * Generates a password reset token and stores it in Redis (expires in 1 hour).
 * In production, this would send an email. For now, we return a success message
 * regardless of whether the email exists (to prevent enumeration).
 */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/auth/forgot-password", async () => {
  const ip = await getClientIp();
  const rl = await checkRateLimit(ip, "login");
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const bodyResult = await readJsonBodyLimited(req, 4_000);
    if (!bodyResult.ok) {
      return NextResponse.json(
        { error: bodyResult.status === 413 ? "Request body too large" : "Invalid request body" },
        { status: bodyResult.status },
      );
    }
    const { email } = forgotSchema.parse(bodyResult.value);

    // Always return success to prevent email enumeration
    const successResponse = () => {
      const response = NextResponse.json({
        message: "If an account with that email exists, a password reset link has been sent.",
      });
      for (const [k, v] of Object.entries(rateLimitHeaders(rl))) {
        response.headers.set(k, v);
      }
      return response;
    };

    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) return successResponse();

    // Generate token
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");

    // Store in Redis with 1-hour TTL
    try {
      const r = getRedis();
      if (r.status !== "ready") await r.connect();
      await r.set(`pilox:password-reset:${tokenHash}`, user.id, "EX", 3600);
    } catch (err) {
      const { createModuleLogger } = await import("@/lib/logger");
      createModuleLogger("auth").error("Redis unavailable for password reset token storage", {
        error: err instanceof Error ? err.message : String(err),
      });
      // Return 503 — token generated but cannot be stored
      return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
    }

    // In development only, log token for local testing
    if (process.env.NODE_ENV === "development") {
      const { createModuleLogger } = await import("@/lib/logger");
      createModuleLogger("auth").info("Password reset token (dev only)", { email, token });
    }

    return successResponse();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
  });
}
