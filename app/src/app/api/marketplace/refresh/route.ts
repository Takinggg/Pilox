// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { db } from "@/db";
import { connectedRegistries } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import {
  MARKETPLACE_CATALOG_CACHE_KEY,
  MARKETPLACE_CATALOG_TTL_SEC,
  buildMarketplaceCatalog,
  invalidateMarketplaceCatalogCache,
  syncAllConnectedRegistryStats,
} from "@/lib/marketplace";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { cacheSet } from "@/lib/redis";
import { decryptSecret } from "@/lib/secrets-crypto";
import { eq } from "drizzle-orm";

/** Operator: bust Redis catalog cache and optionally warm with a fresh aggregate. */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/marketplace/refresh", async () => {
    const authResult = await authorize("operator");
    if (!authResult.authorized) return authResult.response;

    await invalidateMarketplaceCatalogCache();

    const registrySync = await syncAllConnectedRegistryStats();

    const url = new URL(req.url);
    const warm = url.searchParams.get("warm") !== "0";

    if (!warm) {
      return NextResponse.json({ ok: true, warmed: false, registrySync });
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

    const payload = await buildMarketplaceCatalog(decryptedRegistries);
    if (payload.agents.length > 0 || payload.sources.some((s) => s.ok)) {
      await cacheSet(MARKETPLACE_CATALOG_CACHE_KEY, payload, MARKETPLACE_CATALOG_TTL_SEC);
    }

    return NextResponse.json({
      ok: true,
      warmed: true,
      builtAt: payload.builtAt,
      agentCount: payload.agents.length,
      sources: payload.sources,
      registrySync,
    });
  });
}
