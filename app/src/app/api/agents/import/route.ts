// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { resolveImportUrl, resolveFromRegistries } from "@/lib/agent-import-resolver";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { db } from "@/db";
import { connectedRegistries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { decryptSecret } from "@/lib/secrets-crypto";

const importSchema = z.object({
  url: z.string().url().max(2048).optional(),
  registryHandle: z.string().min(1).max(512).optional(),
}).refine((d) => d.url || d.registryHandle, {
  message: "Either url or registryHandle is required",
});

export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/agents/import", async () => {
    const authResult = await authorize("operator");
    if (!authResult.authorized) return authResult.response;

    const rl = await checkRateLimit(authResult.ip, "api");
    if (!rl.allowed) return rateLimitResponse(rl);

    const bodyResult = await readJsonBodyLimited(req, 8_000);
    if (!bodyResult.ok) {
      return errorResponse(ErrorCode.INVALID_INPUT, "Invalid request body", 400);
    }

    const parsed = importSchema.safeParse(bodyResult.value);
    if (!parsed.success) {
      return errorResponse(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0].message, 400);
    }

    try {
      if (parsed.data.registryHandle) {
        // Resolve from connected registries
        const registries = await db
          .select({ url: connectedRegistries.url, authToken: connectedRegistries.authToken })
          .from(connectedRegistries)
          .where(eq(connectedRegistries.enabled, true));

        if (registries.length === 0) {
          return errorResponse(ErrorCode.NOT_FOUND, "No connected registries. Add one in Settings → Marketplace.", 404);
        }

        const decryptedRegistries = registries.map((r) => ({
          ...r,
          authToken: r.authToken ? decryptSecret(r.authToken) : null,
        }));
        const preview = await resolveFromRegistries(parsed.data.registryHandle, decryptedRegistries);
        return NextResponse.json(preview);
      }

      // Resolve from URL
      const preview = await resolveImportUrl(parsed.data.url!);
      return NextResponse.json(preview);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Import resolution failed";
      return errorResponse(ErrorCode.INVALID_INPUT, msg, 400);
    }
  });
}
