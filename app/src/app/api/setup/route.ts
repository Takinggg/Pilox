import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { hash } from "bcryptjs";
import { db } from "@/db";
import { users, auditLogs, instanceRuntimeConfig, connectedRegistries } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/lib/env";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { getClientIp } from "@/lib/request-utils";
import { validatePassword } from "@/lib/password-policy";

import { createModuleLogger } from "@/lib/logger";
import { withHttpServerSpan } from "@/lib/otel-http-route";
const log = createModuleLogger("api.setup");

/** Constant-time token comparison using SHA-256 to avoid length leaks. */
function setupTokenMatches(expected: string, given: string): boolean {
  try {
    const a = createHash("sha256").update(expected).digest();
    const b = createHash("sha256").update(given).digest();
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const setupSchema = z.object({
  name: z.string().min(2).max(255),
  email: z.string().email().transform((e) => e.toLowerCase().trim()),
  password: z.string().min(8).max(128),
  licenseKey: z.string().min(1).max(512).optional(),
  licensePlan: z.object({
    plan: z.string(),
    features: z.record(z.string(), z.boolean()),
    maxInstances: z.number(),
    expiresAt: z.string().nullable(),
  }).optional(),
});

export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/setup", async () => {
  try {
    const ip = await getClientIp();
    const rl = await checkRateLimit(ip, "setup");
    if (!rl.allowed) return rateLimitResponse(rl);

    const cfg = env();

    // In production, require PILOX_SETUP_TOKEN UNLESS this is the very first boot
    // (zero users in the database). This allows initial onboarding without a token
    // while still protecting the endpoint after the first admin is created.
    if (!cfg.PILOX_SETUP_TOKEN && cfg.NODE_ENV === "production") {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users);
      if (count > 0) {
        log.error("PILOX_SETUP_TOKEN is not set — setup endpoint is disabled in production");
        return errorResponse(ErrorCode.INTERNAL_ERROR, "Setup endpoint not configured", 503);
      }
    }

    if (cfg.PILOX_SETUP_TOKEN) {
      const authz = req.headers.get("authorization");
      const headerTok = req.headers.get("x-pilox-setup-token");
      const bearer =
        authz?.startsWith("Bearer ") ? authz.slice(7).trim() : undefined;
      const given = bearer ?? headerTok?.trim() ?? "";
      if (!given || !setupTokenMatches(cfg.PILOX_SETUP_TOKEN, given)) {
        return NextResponse.json({ error: "Invalid setup token" }, { status: 401 });
      }
    }

    const bodyResult = await readJsonBodyLimited(req, 8_000);
    if (!bodyResult.ok) {
      return errorResponse(
        bodyResult.status === 413 ? ErrorCode.PAYLOAD_TOO_LARGE : ErrorCode.INVALID_INPUT,
        bodyResult.status === 413 ? "Request body too large" : "Invalid request body",
        bodyResult.status,
      );
    }
    const { name, email, password, licenseKey, licensePlan } = setupSchema.parse(bodyResult.value);

    const policyResult = validatePassword(password, { userName: name, userEmail: email });
    if (!policyResult.valid) {
      return errorResponse(ErrorCode.VALIDATION_FAILED, "Password does not meet requirements", 400, policyResult.errors);
    }

    const passwordHash = await hash(password, 12);

    // Atomic check-and-insert inside a transaction to prevent TOCTOU race
    const result = await db.transaction(async (tx) => {
      const [existingAdmin] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "admin"))
        .limit(1);

      if (existingAdmin) return "ALREADY_SETUP" as const;

      const [user] = await tx
        .insert(users)
        .values({ name, email, passwordHash, role: "admin" })
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
        });

      await tx.insert(auditLogs).values({
        userId: user.id,
        action: "system.setup",
        resource: "user",
        resourceId: user.id,
        details: { firstAdmin: true },
        ipAddress: ip,
      });

      // Auto-seed local Planetary registry if running in Docker compose
      const localRegistryUrl = process.env.PLANETARY_REGISTRY_URL || "http://planetary-registry:4077";
      await tx
        .insert(connectedRegistries)
        .values({
          name: "Local Planetary Registry",
          url: localRegistryUrl,
          enabled: true,
          createdBy: user.id,
        })
        .onConflictDoNothing();

      // Persist license key in instance config
      if (licenseKey) {
        await tx
          .insert(instanceRuntimeConfig)
          .values({ key: "PILOX_LICENSE_KEY", value: licenseKey })
          .onConflictDoUpdate({
            target: instanceRuntimeConfig.key,
            set: { value: licenseKey, updatedAt: new Date() },
          });
      }
      if (licensePlan) {
        await tx
          .insert(instanceRuntimeConfig)
          .values({ key: "PILOX_LICENSE_PLAN", value: JSON.stringify(licensePlan) })
          .onConflictDoUpdate({
            target: instanceRuntimeConfig.key,
            set: { value: JSON.stringify(licensePlan), updatedAt: new Date() },
          });
      }

      return user;
    });

    if (result === "ALREADY_SETUP") {
      return NextResponse.json({ error: "Setup already completed" }, { status: 403 });
    }

    return NextResponse.json({ success: true, user: result }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    log.error("Setup error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Setup failed" }, { status: 500 });
  }
  });
}
