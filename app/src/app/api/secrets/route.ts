import { NextResponse } from "next/server";
import { db } from "@/db";
import { secrets, auditLogs } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { desc, sql } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { encryptSecret } from "@/lib/secrets-crypto";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { withHttpServerSpan } from "@/lib/otel-http-route";

import { createModuleLogger } from "@/lib/logger";
const log = createModuleLogger("api.secrets");

const createSecretSchema = z.object({
  name: z.string().min(1).max(255),
  value: z.string().min(1).max(65_536),
  agentId: z.string().uuid().optional(),
});

export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/secrets", async () => {
  const authResult = await authorize("operator");
  if (!authResult.authorized) return authResult.response;

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const [items, [{ count }]] = await Promise.all([
    db
      .select({
        id: secrets.id,
        name: secrets.name,
        agentId: secrets.agentId,
        createdBy: secrets.createdBy,
        createdAt: secrets.createdAt,
        updatedAt: secrets.updatedAt,
      })
      .from(secrets)
      .orderBy(desc(secrets.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(secrets),
  ]);

  return NextResponse.json({
    data: items,
    pagination: { total: count, limit, offset },
  });
  });
}

export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/secrets", async () => {
  const authResult = await authorize("operator");
  if (!authResult.authorized) return authResult.response;

  // Rate limit secrets operations
  const rl = await checkRateLimit(authResult.ip, "secrets");
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const bodyResult = await readJsonBodyLimited(req, 128_000);
    if (!bodyResult.ok) {
      return errorResponse(
        bodyResult.status === 413 ? ErrorCode.PAYLOAD_TOO_LARGE : ErrorCode.INVALID_INPUT,
        bodyResult.status === 413 ? "Request body too large" : "Invalid request body",
        bodyResult.status,
      );
    }
    const data = createSecretSchema.parse(bodyResult.value);

    const encryptedValue = encryptSecret(data.value);

    const [secret] = await db
      .insert(secrets)
      .values({
        name: data.name,
        encryptedValue,
        agentId: data.agentId,
        createdBy: authResult.user.id,
      })
      .returning({
        id: secrets.id,
        name: secrets.name,
        agentId: secrets.agentId,
        createdAt: secrets.createdAt,
      });

    await db.insert(auditLogs).values({
      userId: authResult.user.id,
      action: "secret.create",
      resource: "secret",
      resourceId: secret.id,
      details: { name: data.name },
      ipAddress: authResult.ip,
    });

    return NextResponse.json(secret, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(ErrorCode.VALIDATION_FAILED, "Validation failed", 400, error.issues);
    }
    log.error("Secret creation error:", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(ErrorCode.INTERNAL_ERROR, "Failed to create secret", 500);
  }
  });
}
