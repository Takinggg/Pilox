// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { authorizeMarketplaceCatalogRead } from "@/lib/marketplace/catalog-public-auth";
import { loadMarketplaceCatalogPool } from "@/lib/marketplace/catalog-pool";
import { queryMarketplaceAgents, type MarketplaceListSort } from "@/lib/marketplace/catalog-query";
import { getMarketplacePricingEnforcement } from "@/lib/marketplace/pricing-policy";
import type { MarketplaceCatalogPayload } from "@/lib/marketplace/types";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { z } from "zod";

const sortSchema = z.enum(["name", "handle"]);

export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/marketplace", async () => {
    const authResult = await authorizeMarketplaceCatalogRead();
    if (!authResult.ok) return authResult.response;

    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.toLowerCase() ?? "";
    const tagsFilter = url.searchParams.get("tags")?.split(",").filter(Boolean) ?? [];
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50") || 50, 200);
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0") || 0);
    const bypassCache = url.searchParams.get("refresh") === "1";
    const registryUrl = url.searchParams.get("registryUrl")?.trim() || undefined;
    const sortParsed = sortSchema.safeParse(url.searchParams.get("sort") ?? "name");
    const sort: MarketplaceListSort = sortParsed.success ? sortParsed.data : "name";

    const pool = await loadMarketplaceCatalogPool(bypassCache);

    if (pool.registries.length === 0 && pool.poolAgents.length === 0) {
      return NextResponse.json({
        data: [],
        total: 0,
        offset,
        limit,
        meta: {
          registries: 0,
          builtAt: new Date().toISOString(),
          sources: [] as MarketplaceCatalogPayload["sources"],
          cache: "none",
          catalog: "none",
          tags: [] as string[],
          pricingEnforcement: getMarketplacePricingEnforcement(),
        },
      });
    }

    const filtered = queryMarketplaceAgents(pool.poolAgents, {
      q,
      tags: tagsFilter,
      registryUrl,
      sort,
    });

    const total = filtered.length;
    const page = filtered.slice(offset, offset + limit);

    return NextResponse.json({
      data: page,
      total,
      offset,
      limit,
      meta: {
        registries: pool.registries.length + pool.globalCatalogSlots,
        builtAt: pool.builtAt,
        sources: pool.sources,
        cache: bypassCache ? "bypass" : pool.catalogMode === "db" ? "db_index" : "redis",
        catalog: pool.catalogMode,
        tags: pool.catalogTags,
        pricingEnforcement: getMarketplacePricingEnforcement(),
      },
    });
  });
}
