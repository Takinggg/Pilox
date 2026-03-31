// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/db";
import { connectedRegistries } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import {
  parsePiloxClientIpSource,
  resolveClientIpFromHeaderGetter,
} from "@/lib/client-ip-headers";
import { ErrorCode, errorResponse } from "@/lib/errors";
import {
  effectivePiloxClientIpSource,
  effectiveMarketplaceVerifyPublic,
} from "@/lib/runtime-instance-config";
import { resolveHandleAcrossRegistries } from "@/lib/marketplace";
import { verifyRegistryRecordProof } from "@/lib/marketplace/registry-record-proof";
import {
  marketplaceTransparencyOptionsResponse,
  transparencyCorsHeaders,
} from "@/lib/marketplace/transparency-cors";
import { checkRateLimit, rateLimitHeaders, rateLimitResponse } from "@/lib/rate-limit";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { decryptSecret } from "@/lib/secrets-crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";

function proofSummary(
  rec: Record<string, unknown>,
  proofResult: ReturnType<typeof verifyRegistryRecordProof>,
): "none" | "unsigned" | "valid" | "invalid" {
  const p = rec.proof;
  if (!p || typeof p !== "object" || Array.isArray(p)) return "none";
  const sigHex = (p as Record<string, unknown>).sigHex;
  if (sigHex === undefined || sigHex === null || sigHex === "") return "unsigned";
  return proofResult.ok ? "valid" : "invalid";
}

function withOptionalCors(req: Request, res: NextResponse): NextResponse {
  const cors = transparencyCorsHeaders(req);
  if (cors) {
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  }
  return res;
}

/**
 * Transparency: resolve a handle like `GET /api/marketplace/:handle`, then verify optional
 * `pilox-registry-record-ed25519-v1` proof on the record.
 *
 * Auth: **viewer** session or API token. If `PILOX_MARKETPLACE_VERIFY_PUBLIC=true`, unauthenticated
 * callers are allowed and rate-limited per IP (`marketplace_verify_public`); authenticated callers skip that bucket.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  return withHttpServerSpan(req, "GET /api/marketplace/:handle/verify", async () => {
    const verifyPublic = effectiveMarketplaceVerifyPublic();
    const authResult = await authorize("viewer");
    const authedViewer = authResult.authorized;

    if (!authedViewer) {
      if (!verifyPublic) {
        return authResult.response;
      }
      const h = await headers();
      const ip = resolveClientIpFromHeaderGetter(
        (n) => h.get(n),
        parsePiloxClientIpSource(effectivePiloxClientIpSource()),
        { useMiddlewareSetClientIp: true },
      );
      const rl = await checkRateLimit(ip, "marketplace_verify_public");
      if (!rl.allowed) {
        const r = rateLimitResponse(rl);
        const cors = transparencyCorsHeaders(req);
        const hdrs = new Headers(r.headers);
        if (cors) for (const [k, v] of Object.entries(cors)) hdrs.set(k, v);
        for (const [k, v] of Object.entries(rateLimitHeaders(rl))) hdrs.set(k, v);
        return new Response(r.body, { status: r.status, headers: hdrs });
      }
    }

    const { handle } = await params;
    const url = new URL(req.url);
    const rid = url.searchParams.get("registryId")?.trim();
    let registryIdFilter: string | undefined;
    if (rid) {
      const parsed = z.string().uuid().safeParse(rid);
      if (!parsed.success) {
        return errorResponse(ErrorCode.VALIDATION_FAILED, "registryId must be a UUID", 400);
      }
      registryIdFilter = parsed.data;
    }

    const registries = await db
      .select({
        id: connectedRegistries.id,
        name: connectedRegistries.name,
        url: connectedRegistries.url,
        authToken: connectedRegistries.authToken,
      })
      .from(connectedRegistries)
      .where(eq(connectedRegistries.enabled, true));

    const decryptedRegistries = registries.map((r) => ({
      ...r,
      authToken: r.authToken ? decryptSecret(r.authToken) : r.authToken,
    }));

    const resolved = await resolveHandleAcrossRegistries(handle, decryptedRegistries, {
      registryId: registryIdFilter,
    });
    if (!resolved) {
      return errorResponse(ErrorCode.NOT_FOUND, `Handle "${handle}" not found in any connected registry`, 404);
    }

    const record = resolved.record;
    const proof = verifyRegistryRecordProof(record);
    const schema = typeof record.schema === "string" ? record.schema : null;
    const schemaOk = schema === "pilox-registry-record-v1";

    const res = NextResponse.json({
      handle,
      registryId: resolved.registryId,
      registryName: resolved.registryName,
      registryUrl: resolved.registryUrl,
      schemaOk,
      schema,
      proof,
      proofSummary: proofSummary(record, proof),
      agentCard: {
        fetched: resolved.agentCard !== null,
        parsed: resolved.agentCard !== null,
      },
      verifiedAt: new Date().toISOString(),
      publicAccess: verifyPublic && !authedViewer,
    });
    return withOptionalCors(req, res);
  });
}

export async function OPTIONS(req: Request) {
  return marketplaceTransparencyOptionsResponse(req);
}
