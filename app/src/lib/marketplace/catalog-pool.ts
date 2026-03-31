// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { db } from "@/db";
import { connectedRegistries } from "@/db/schema";
import { env } from "@/lib/env";
import { cacheGet, cacheSet } from "@/lib/redis";
import { eq } from "drizzle-orm";
import { effectiveRuntimeString } from "@/lib/runtime-instance-config";
import { buildMarketplaceCatalog, type RegistryConnection } from "./catalog";
import { MARKETPLACE_CATALOG_CACHE_KEY, MARKETPLACE_CATALOG_TTL_SEC } from "./constants";
import { decryptSecret } from "@/lib/secrets-crypto";
import { getIndexSourceMeta, loadMarketplaceCatalogFromIndex } from "./catalog-db";
import { fetchPiloxGlobalCatalogAgents } from "./global-catalog-fetch";
import type { MarketplaceAgent, MarketplaceCatalogPayload, RegistryCatalogSourceMeta } from "./types";

export type MarketplaceCatalogPool = {
  registries: RegistryConnection[];
  poolAgents: MarketplaceCatalogPayload["agents"];
  sources: MarketplaceCatalogPayload["sources"];
  builtAt: string;
  catalogTags: string[];
  catalogMode: "redis" | "db" | "db_fallback";
  /** 1 when `PILOX_GLOBAL_CATALOG_URL` contributed agents (for `meta.registries` / empty-instance UX). */
  globalCatalogSlots: 0 | 1;
};

async function mergeGlobalCatalog(
  poolAgents: MarketplaceAgent[],
  sources: RegistryCatalogSourceMeta[],
  catalogTags: string[],
  builtAt: string,
): Promise<{
  poolAgents: MarketplaceAgent[];
  sources: RegistryCatalogSourceMeta[];
  catalogTags: string[];
  builtAt: string;
  globalCatalogSlots: 0 | 1;
}> {
  const url = env().PILOX_GLOBAL_CATALOG_URL?.trim();
  if (!url) {
    return { poolAgents, sources, catalogTags, builtAt, globalCatalogSlots: 0 };
  }
  try {
    const { agents, builtAt: remoteBuilt, source } = await fetchPiloxGlobalCatalogAgents(url);
    if (agents.length === 0) {
      return { poolAgents, sources, catalogTags, builtAt, globalCatalogSlots: 0 };
    }
    const keys = new Set(poolAgents.map((a) => `${a.registryId}\0${a.handle.toLowerCase()}`));
    const merged = [...poolAgents];
    for (const a of agents) {
      const k = `${a.registryId}\0${a.handle.toLowerCase()}`;
      if (!keys.has(k)) {
        merged.push(a);
        keys.add(k);
      }
    }
    const nextSources = source ? [...sources, source] : sources;
    const tagSet = new Set(catalogTags);
    for (const a of agents) {
      for (const t of a.tags ?? []) tagSet.add(t);
    }
    const nextBuilt =
      remoteBuilt && (!builtAt || remoteBuilt > builtAt) ? remoteBuilt : builtAt;
    return {
      poolAgents: merged,
      sources: nextSources,
      catalogTags: Array.from(tagSet),
      builtAt: nextBuilt,
      globalCatalogSlots: 1,
    };
  } catch {
    return { poolAgents, sources, catalogTags, builtAt, globalCatalogSlots: 0 };
  }
}

/**
 * Shared loader for GET /api/marketplace and GET /api/marketplace/catalog-export.
 */
export async function loadMarketplaceCatalogPool(
  bypassCache: boolean,
): Promise<MarketplaceCatalogPool> {
  const rawRegistries = await db
    .select({
      id: connectedRegistries.id,
      name: connectedRegistries.name,
      url: connectedRegistries.url,
      authToken: connectedRegistries.authToken,
    })
    .from(connectedRegistries)
    .where(eq(connectedRegistries.enabled, true));

  const registries: RegistryConnection[] = rawRegistries.map((r) => ({
    ...r,
    authToken: r.authToken ? decryptSecret(r.authToken) : null,
  }));

  if (registries.length === 0) {
    const builtAt = new Date().toISOString();
    const merged = await mergeGlobalCatalog([], [], [], builtAt);
    return {
      registries,
      poolAgents: merged.poolAgents,
      sources: merged.sources,
      builtAt: merged.builtAt,
      catalogTags: merged.catalogTags,
      catalogMode: "redis",
      globalCatalogSlots: merged.globalCatalogSlots,
    };
  }

  const rt = effectiveRuntimeString("MARKETPLACE_CATALOG_SOURCE").trim();
  const preferDb =
    rt === "db" ? true : rt === "" ? process.env.MARKETPLACE_CATALOG_SOURCE === "db" : false;

  let poolAgents: MarketplaceCatalogPayload["agents"] = [];
  let sources: MarketplaceCatalogPayload["sources"] = [];
  let builtAt = new Date().toISOString();
  let catalogTags: string[] = [];
  let catalogMode: "redis" | "db" | "db_fallback" = "redis";
  let usedDbIndex = false;

  if (preferDb) {
    const fromDb = await loadMarketplaceCatalogFromIndex();
    if (fromDb.agents.length > 0) {
      poolAgents = fromDb.agents;
      builtAt = fromDb.builtAt;
      catalogTags = fromDb.tags;
      sources = await getIndexSourceMeta();
      catalogMode = "db";
      usedDbIndex = true;
    }
  }

  if (!usedDbIndex) {
    let payload: MarketplaceCatalogPayload | null = null;
    if (!bypassCache) {
      payload = await cacheGet<MarketplaceCatalogPayload>(MARKETPLACE_CATALOG_CACHE_KEY);
    }
    if (!payload) {
      payload = await buildMarketplaceCatalog(registries);
      if (payload.agents.length > 0 || payload.sources.some((s) => s.ok)) {
        await cacheSet(MARKETPLACE_CATALOG_CACHE_KEY, payload, MARKETPLACE_CATALOG_TTL_SEC);
      }
    }
    poolAgents = payload.agents;
    sources = payload.sources;
    builtAt = payload.builtAt;
    catalogTags = payload.tags ?? [];
    catalogMode = preferDb ? "db_fallback" : "redis";
  }

  const merged = await mergeGlobalCatalog(poolAgents, sources, catalogTags, builtAt);
  return {
    registries,
    poolAgents: merged.poolAgents,
    sources: merged.sources,
    builtAt: merged.builtAt,
    catalogTags: merged.catalogTags,
    catalogMode,
    globalCatalogSlots: merged.globalCatalogSlots,
  };
}
