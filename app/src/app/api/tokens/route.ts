import { NextResponse } from "next/server";
import { db } from "@/db";
import { apiTokens, auditLogs } from "@/db/schema";
import { authorize, type Role, ROLE_HIERARCHY } from "@/lib/authorize";
import { eq, desc, sql } from "drizzle-orm";
import { randomBytes, createHash, createHmac } from "node:crypto";
import { z } from "zod";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

import { createModuleLogger } from "@/lib/logger";
import { withHttpServerSpan } from "@/lib/otel-http-route";
const log = createModuleLogger("api.tokens");

const createTokenSchema = z.object({
  name: z.string().min(1).max(255),
  role: z.enum(["admin", "operator", "viewer"]).optional(),
  expiresInDays: z.number().int().positive().max(365).optional(),
});

/**
 * GET /api/tokens
 * List all API tokens for the authenticated user. Admins see all tokens.
 * Never returns the token hash or plaintext token.
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/tokens", async () => {
  const authResult = await authorize("operator");
  if (!authResult.authorized) return authResult.response;

  const url = new URL(req.url);
  const rawLimit = parseInt(url.searchParams.get("limit") || "50");
  const rawOffset = parseInt(url.searchParams.get("offset") || "0");
  if (isNaN(rawLimit) || isNaN(rawOffset) || rawLimit < 1 || rawOffset < 0) {
    return NextResponse.json({ error: "Invalid pagination parameters" }, { status: 400 });
  }
  const limit = Math.min(rawLimit, 100);
  const offset = rawOffset;

  // Operators see only their own tokens; admins see all
  const baseWhere =
    authResult.role === "admin"
      ? undefined
      : eq(apiTokens.userId, authResult.user.id!);

  const [items, [{ count }]] = await Promise.all([
    db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        tokenPrefix: apiTokens.tokenPrefix,
        role: apiTokens.role,
        userId: apiTokens.userId,
        expiresAt: apiTokens.expiresAt,
        lastUsedAt: apiTokens.lastUsedAt,
        createdAt: apiTokens.createdAt,
      })
      .from(apiTokens)
      .where(baseWhere)
      .orderBy(desc(apiTokens.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(apiTokens)
      .where(baseWhere),
  ]);

  return NextResponse.json({
    data: items,
    pagination: { total: count, limit, offset },
  });
  });
}

/**
 * POST /api/tokens
 * Create a new API token. The plaintext token is returned exactly once.
 */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/tokens", async () => {
  const authResult = await authorize("operator");
  if (!authResult.authorized) return authResult.response;

  const rl = await checkRateLimit(authResult.ip, "api");
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const bodyResult = await readJsonBodyLimited(req, 8_000);
    if (!bodyResult.ok) {
      return errorResponse(
        bodyResult.status === 413 ? ErrorCode.PAYLOAD_TOO_LARGE : ErrorCode.INVALID_INPUT,
        bodyResult.status === 413 ? "Request body too large" : "Invalid request body",
        bodyResult.status,
      );
    }
    const data = createTokenSchema.parse(bodyResult.value);

    const requestedRole: Role = data.role ?? "viewer";

    // A user cannot create a token with a role higher than their own
    const callerLevel = ROLE_HIERARCHY[authResult.role as Role] ?? 0;
    const requestedLevel = ROLE_HIERARCHY[requestedRole] ?? 0;

    if (requestedLevel > callerLevel) {
      return errorResponse(
        ErrorCode.FORBIDDEN,
        `Cannot create a token with role "${requestedRole}" — your role is "${authResult.role}"`,
        403,
      );
    }

    // Generate a cryptographically random 32-byte token
    const plaintext = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(plaintext).digest("hex");
    const tokenPrefix = plaintext.slice(0, 8);

    // HMAC integrity tag — prevents tokens injected via direct DB access
    const { env: getEnv } = await import("@/lib/env");
    const hmacKey = getEnv().ENCRYPTION_KEY; // reuse existing 32-byte key
    const tokenHmac = createHmac("sha256", hmacKey).update(tokenHash).digest("hex");

    const expiresAt = data.expiresInDays
      ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const [token] = await db
      .insert(apiTokens)
      .values({
        name: data.name,
        tokenHash,
        tokenPrefix,
        tokenHmac,
        userId: authResult.user.id!,
        role: requestedRole,
        expiresAt,
      })
      .returning({
        id: apiTokens.id,
        name: apiTokens.name,
        tokenPrefix: apiTokens.tokenPrefix,
        role: apiTokens.role,
        expiresAt: apiTokens.expiresAt,
        createdAt: apiTokens.createdAt,
      });

    await db.insert(auditLogs).values({
      userId: authResult.user.id,
      action: "api_token.create",
      resource: "api_token",
      resourceId: token.id,
      details: { name: data.name, role: requestedRole },
      ipAddress: authResult.ip,
    });

    return NextResponse.json(
      {
        ...token,
        // Return the plaintext token exactly once — it cannot be retrieved again
        token: plaintext,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(ErrorCode.VALIDATION_FAILED, "Validation failed", 400, error.issues);
    }
    log.error("Token creation error:", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to create token", 500);
  }
  });
}
