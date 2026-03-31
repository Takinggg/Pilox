// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { loadMarketplaceCatalogPool } from "@/lib/marketplace/catalog-pool";
import { queryMarketplaceAgents, type MarketplaceListSort } from "@/lib/marketplace/catalog-query";
import { getMarketplacePricingEnforcement } from "@/lib/marketplace/pricing-policy";
import {
  marketplaceTransparencyOptionsResponse,
  transparencyCorsHeaders,
} from "@/lib/marketplace/transparency-cors";
import { withHttpServerSpan } from "@/lib/otel-http-route";
import { z } from "zod";

const sortSchema = z.enum(["name", "handle"]);

/**
 * Full catalog JSON for mirrors / Git snapshots (no pagination).
 * Auth: **operator** (session or API token). Same CORS rules as verify when `PILOX_MARKETPLACE_CORS_ORIGINS` is set.
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/marketplace/catalog-export", async () => {
    const authResult = await authorize("operator");
    if (!authResult.authorized) return authResult.response;

    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.toLowerCase() ?? "";
    const tagsFilter = url.searchParams.get("tags")?.split(",").filter(Boolean) ?? [];
    const bypassCache = url.searchParams.get("refresh") === "1";
    const registryUrl = url.searchParams.get("registryUrl")?.trim() || undefined;
    const sortParsed = sortSchema.safeParse(url.searchParams.get("sort") ?? "name");
    const sort: MarketplaceListSort = sortParsed.success ? sortParsed.data : "name";

    const pool = await loadMarketplaceCatalogPool(bypassCache);

    const filtered = queryMarketplaceAgents(pool.poolAgents, {
      q,
      tags: tagsFilter,
      registryUrl,
      sort,
    });

    const body = {
      schema: "pilox-marketplace-catalog-export-v1" as const,
      exportedAt: new Date().toISOString(),
      agents: filtered,
      total: filtered.length,
      meta: {
        registries: pool.registries.length + pool.globalCatalogSlots,
        builtAt: pool.builtAt,
        sources: pool.sources,
        cache: bypassCache ? "bypass" : pool.catalogMode === "db" ? "db_index" : "redis",
        catalog: pool.catalogMode,
        tags: pool.catalogTags,
        pricingEnforcement: getMarketplacePricingEnforcement(),
      },
    };

    const res = NextResponse.json(body);
    const cors = transparencyCorsHeaders(req);
    if (cors) {
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    }
    return res;
  });
}

export async function OPTIONS(req: Request) {
  return marketplaceTransparencyOptionsResponse(req);
}
