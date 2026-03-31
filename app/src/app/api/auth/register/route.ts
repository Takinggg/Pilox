import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { db } from "@/db";
import { users, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimit, rateLimitResponse, rateLimitHeaders } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-utils";
import { authorize } from "@/lib/authorize";
import { effectiveAllowPublicRegistration } from "@/lib/runtime-instance-config";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { validatePassword } from "@/lib/password-policy";

import { createModuleLogger } from "@/lib/logger";
import { withHttpServerSpan } from "@/lib/otel-http-route";
const log = createModuleLogger("api.auth.register");

const registerSchema = z.object({
  name: z.string().min(2).max(255),
  email: z.string().email().transform((e) => e.toLowerCase().trim()),
  password: z.string().min(8).max(128),
  role: z.enum(["admin", "operator", "viewer"]).optional(),
});

export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/auth/register", async () => {
  const ip = await getClientIp();
  const adminAuth = await authorize("admin");
  const isAdminInvite = adminAuth.authorized;
  if (!isAdminInvite && !effectiveAllowPublicRegistration()) {
    return NextResponse.json(
      { error: "Registration is disabled" },
      { status: 403 }
    );
  }

  const rlPreset = isAdminInvite ? "api" : "register";
  const rl = await checkRateLimit(ip, rlPreset);
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const bodyResult = await readJsonBodyLimited(req, 8_000);
    if (!bodyResult.ok) {
      return NextResponse.json(
        { error: bodyResult.status === 413 ? "Request body too large" : "Invalid request body" },
        { status: bodyResult.status },
      );
    }
    const { name, email, password, role: bodyRole } = registerSchema.parse(bodyResult.value);
    const role = isAdminInvite && bodyRole ? bodyRole : "viewer";

    // Validate password policy with contextual check
    const policyResult = validatePassword(password, { userName: name, userEmail: email });
    if (!policyResult.valid) {
      return NextResponse.json(
        { error: "Password does not meet requirements", details: policyResult.errors },
        { status: 400 },
      );
    }

    const passwordHash = await hash(password, 12);

    // Use onConflictDoNothing to avoid TOCTOU race on email uniqueness
    const [user] = await db
      .insert(users)
      .values({ name, email, passwordHash, role })
      .onConflictDoNothing({ target: users.email })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
      });

    if (!user) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      );
    }

    // Audit log — record the admin who invited (if applicable)
    await db.insert(auditLogs).values({
      userId: isAdminInvite ? adminAuth.user.id : user.id,
      action: isAdminInvite ? "user.invite" : "user.register",
      resource: "user",
      resourceId: user.id,
      details: isAdminInvite ? { invitedBy: adminAuth.user.id, role } : undefined,
      ipAddress: ip,
    });

    const response = NextResponse.json(user, { status: 201 });
    for (const [k, v] of Object.entries(rateLimitHeaders(rl))) {
      response.headers.set(k, v);
    }
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    log.error("Registration error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
  });
}
