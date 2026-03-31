import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { users, auditLogs } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { getRedis } from "@/lib/redis";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-utils";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { incrementSecurityVersion } from "@/lib/session-security";
import { validatePassword } from "@/lib/password-policy";
import { withHttpServerSpan } from "@/lib/otel-http-route";

const resetSchema = z.object({
  token: z.string().length(64).regex(/^[0-9a-f]+$/, "Invalid token format"),
  password: z.string().min(8).max(72),
});

/**
 * POST /api/auth/reset-password
 * Validates the reset token and updates the user's password.
 */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/auth/reset-password", async () => {
  const ip = await getClientIp();
  const rl = await checkRateLimit(ip, "login");
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const bodyResult = await readJsonBodyLimited(req, 8_000);
    if (!bodyResult.ok) {
      return NextResponse.json(
        { error: bodyResult.status === 413 ? "Request body too large" : "Invalid request body" },
        { status: bodyResult.status },
      );
    }
    const { token, password } = resetSchema.parse(bodyResult.value);

    const tokenHash = createHash("sha256").update(token).digest("hex");

    // Atomically get + delete the token (prevents reuse)
    let userId: string | null = null;
    try {
      const r = getRedis();
      if (r.status !== "ready") await r.connect();
      userId = await r.getdel(`pilox:password-reset:${tokenHash}`);
    } catch {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Invalid or expired reset token" },
        { status: 400 }
      );
    }

    // Validate password policy (fetch user for contextual check)
    const [targetUser] = await db
      .select({ name: users.name, email: users.email, deactivatedAt: users.deactivatedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Reject reset for deactivated accounts
    if (targetUser.deactivatedAt) {
      return NextResponse.json({ error: "Account is deactivated" }, { status: 403 });
    }

    const policyResult = validatePassword(password, { userName: targetUser.name, userEmail: targetUser.email });
    if (!policyResult.valid) {
      return NextResponse.json(
        { error: "Password does not meet requirements", details: policyResult.errors },
        { status: 400 },
      );
    }

    const passwordHash = await hash(password, 12);
    const [updated] = await db
      .update(users)
      .set({
        passwordHash,
        updatedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      })
      .where(and(eq(users.id, userId), sql`${users.deactivatedAt} IS NULL`))
      .returning({ id: users.id });

    if (!updated) {
      return NextResponse.json(
        { error: "User not found or deactivated" },
        { status: 404 }
      );
    }

    // Invalidate all existing sessions for this user
    await incrementSecurityVersion(updated.id);

    await db.insert(auditLogs).values({
      userId: updated.id,
      action: "user.password_reset",
      resource: "user",
      resourceId: updated.id,
      ipAddress: ip,
    });

    return NextResponse.json({ success: true, message: "Password has been reset" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    const { createModuleLogger } = await import("@/lib/logger");
    createModuleLogger("auth").error("Password reset failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
  });
}
