// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { db } from "@/db";
import { connectedRegistries, marketplaceCatalogRows } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import type { MarketplaceAgent } from "./types";
import type { RegistryCatalogSourceMeta } from "./types";
import { replaceMarketplaceCatalogIndexWithDb } from "./catalog-db-write";

export async function replaceMarketplaceCatalogIndex(agents: MarketplaceAgent[]): Promise<void> {
  await replaceMarketplaceCatalogIndexWithDb(db, agents);
}

export async function loadMarketplaceCatalogFromIndex(): Promise<{
  agents: MarketplaceAgent[];
  builtAt: string;
  tags: string[];
}> {
  const rows = await db.select().from(marketplaceCatalogRows);
  if (rows.length === 0) {
    return { agents: [], builtAt: new Date().toISOString(), tags: [] };
  }
  let latest = rows[0]!.updatedAt;
  const agents: MarketplaceAgent[] = [];
  const tagSet = new Set<string>();
  for (const r of rows) {
    if (r.updatedAt > latest) latest = r.updatedAt;
    const a = r.agent as unknown as MarketplaceAgent;
    agents.push(a);
    for (const t of a.tags ?? []) tagSet.add(t);
  }
  return {
    agents,
    builtAt: latest.toISOString(),
    tags: [...tagSet].sort(),
  };
}

export async function getIndexSourceMeta(): Promise<RegistryCatalogSourceMeta[]> {
  const regs = await db
    .select({
      id: connectedRegistries.id,
      name: connectedRegistries.name,
      url: connectedRegistries.url,
      enabled: connectedRegistries.enabled,
    })
    .from(connectedRegistries)
    .where(eq(connectedRegistries.enabled, true));

  const counts = await db
    .select({
      registryId: marketplaceCatalogRows.registryId,
      c: sql<number>`count(*)::int`,
    })
    .from(marketplaceCatalogRows)
    .groupBy(marketplaceCatalogRows.registryId);

  const countMap = new Map(counts.map((x) => [x.registryId, x.c]));

  return regs.map((r) => ({
    registryId: r.id,
    name: r.name,
    url: r.url.replace(/\/+$/, ""),
    ok: true,
    agentCount: countMap.get(r.id) ?? 0,
    fetchMs: 0,
  }));
}
