// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { db } from "@/db";
import { connectedRegistries } from "@/db/schema";
import { authorizeMarketplaceCatalogRead } from "@/lib/marketplace/catalog-public-auth";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { extractJsonRpcUrlFromAgentCard } from "@/lib/marketplace/agent-card-endpoints";
import { resolveHandleAcrossRegistries } from "@/lib/marketplace";
import { getMarketplaceLocalStats } from "@/lib/marketplace/local-stats";
import { getMarketplacePricingEnforcement } from "@/lib/marketplace/pricing-policy";
import { marketplaceAgentFromResolved } from "@/lib/marketplace/resolved-to-agent";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { decryptSecret } from "@/lib/secrets-crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  return withHttpServerSpan(req, "GET /api/marketplace/:handle", async () => {
    const authResult = await authorizeMarketplaceCatalogRead();
    if (!authResult.ok) return authResult.response;

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

    const rec = resolved.record as Record<string, unknown>;
    const meshDescriptorUrl =
      typeof rec.meshDescriptorUrl === "string" ? rec.meshDescriptorUrl : undefined;
    const jsonRpcUrl = extractJsonRpcUrlFromAgentCard(resolved.agentCard);

    let normalized;
    try {
      normalized = marketplaceAgentFromResolved(resolved);
    } catch {
      normalized = null;
    }

    const localStats = await getMarketplaceLocalStats(resolved.registryId, handle);

    return NextResponse.json({
      record: resolved.record,
      agentCard: resolved.agentCard,
      registryName: resolved.registryName,
      registryUrl: resolved.registryUrl,
      registryId: resolved.registryId,
      meshDescriptorUrl,
      jsonRpcUrl,
      normalized,
      localStats,
      pricingEnforcement: getMarketplacePricingEnforcement(),
    });
  });
}
