// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { db } from "@/db";
import { connectedRegistries } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { buildMarketplaceCatalog, invalidateMarketplaceCatalogCache } from "@/lib/marketplace";
import { replaceMarketplaceCatalogIndex } from "@/lib/marketplace/catalog-db";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { decryptSecret } from "@/lib/secrets-crypto";
import { eq } from "drizzle-orm";

/**
 * Rebuild Postgres marketplace index + bust Redis catalog cache.
 * Schedule via cron / systemd calling this with an operator session, or run `npm run marketplace:index-sync`.
 */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/marketplace/index-rebuild", async () => {
    const authResult = await authorize("operator");
    if (!authResult.authorized) return authResult.response;

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
    await replaceMarketplaceCatalogIndex(payload.agents);
    await invalidateMarketplaceCatalogCache();

    return NextResponse.json({
      ok: true,
      rowCount: payload.agents.length,
      builtAt: payload.builtAt,
      tags: payload.tags?.length ?? 0,
    });
  });
}
