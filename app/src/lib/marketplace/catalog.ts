// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { cacheInvalidate } from "@/lib/redis";
import {
  MARKETPLACE_CARD_TIMEOUT_MS,
  MARKETPLACE_CATALOG_CACHE_KEY,
  MARKETPLACE_LIST_TIMEOUT_MS,
  MARKETPLACE_MAX_HANDLES_PER_REGISTRY,
  MARKETPLACE_RECORD_CONCURRENCY,
  MARKETPLACE_RECORD_TIMEOUT_MS,
} from "./constants";
import { fetchTextWithSsrfGuard } from "@/lib/egress-ssrf-guard";
import { mergeAgentCardJson } from "./agent-card-merge";
import { collectBuyerInputs } from "./buyer-inputs";
import { applyRegistryRecordMetadata } from "./record-metadata";
import type {
  MarketplaceAgent,
  MarketplaceCatalogPayload,
  RegistryCatalogSourceMeta,
} from "./types";

export type RegistryConnection = {
  id: string;
  name: string;
  url: string;
  authToken: string | null;
};

function registryBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function buildAuthHeaders(authToken: string | null): Record<string, string> {
  if (!authToken) return {};
  return { Authorization: `Bearer ${authToken}` };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

async function enrichFromAgentCard(
  agent: MarketplaceAgent,
  record: Record<string, unknown>,
): Promise<void> {
  const agentCardUrl = typeof record.agentCardUrl === "string" ? record.agentCardUrl : "";
  if (!agentCardUrl) {
    agent.buyerInputs = collectBuyerInputs(record, null);
    return;
  }
  try {
    const fr = await fetchTextWithSsrfGuard(agentCardUrl, {
      timeoutMs: MARKETPLACE_CARD_TIMEOUT_MS,
      maxBytes: 512_000,
      headers: { Accept: "application/json" },
    });
    if (!fr.ok) {
      agent.buyerInputs = collectBuyerInputs(record, null);
      return;
    }
    let card: unknown;
    try {
      card = JSON.parse(fr.text) as unknown;
    } catch {
      agent.buyerInputs = collectBuyerInputs(record, null);
      return;
    }
    mergeAgentCardJson(agent, card);
    agent.buyerInputs = collectBuyerInputs(record, card);
  } catch {
    agent.buyerInputs = collectBuyerInputs(record, null);
  }
}

/**
 * Fetches and normalizes marketplace agents from a single registry HTTP API.
 */
export async function fetchRegistryCatalogSlice(
  registry: RegistryConnection,
): Promise<{ agents: MarketplaceAgent[]; meta: RegistryCatalogSourceMeta }> {
  const started = Date.now();
  const base = registryBaseUrl(registry.url);
  const headers = buildAuthHeaders(registry.authToken);

  const metaBase: RegistryCatalogSourceMeta = {
    registryId: registry.id,
    name: registry.name,
    url: base,
    ok: false,
    agentCount: 0,
    fetchMs: 0,
  };

  try {
    const listRes = await fetch(`${base}/v1/records`, {
      headers,
      signal: AbortSignal.timeout(MARKETPLACE_LIST_TIMEOUT_MS),
    });
    if (!listRes.ok) {
      return {
        agents: [],
        meta: {
          ...metaBase,
          fetchMs: Date.now() - started,
          error: `list HTTP ${listRes.status}`,
        },
      };
    }

    const listBody = (await listRes.json()) as { handles?: string[] };
    const handles = Array.isArray(listBody.handles) ? listBody.handles : [];
    const limited = handles.slice(0, MARKETPLACE_MAX_HANDLES_PER_REGISTRY);

    const recordBodies = await mapPool(limited, MARKETPLACE_RECORD_CONCURRENCY, async (handle) => {
      try {
        const recRes = await fetch(`${base}/v1/records/${encodeURIComponent(handle)}`, {
          headers,
          signal: AbortSignal.timeout(MARKETPLACE_RECORD_TIMEOUT_MS),
        });
        if (!recRes.ok) return null;
        return (await recRes.json()) as Record<string, unknown>;
      } catch {
        return null;
      }
    });

    const agents: MarketplaceAgent[] = [];

    for (const record of recordBodies) {
      if (!record || typeof record.handle !== "string" || typeof record.agentCardUrl !== "string") {
        continue;
      }

      const agent: MarketplaceAgent = {
        handle: record.handle,
        registryName: registry.name,
        registryUrl: base,
        registryId: registry.id,
        agentCardUrl: record.agentCardUrl,
        tags: Array.isArray(record.capabilities)
          ? (record.capabilities as string[])
          : undefined,
        meshDescriptorUrl:
          typeof record.meshDescriptorUrl === "string" ? record.meshDescriptorUrl : undefined,
      };

      applyRegistryRecordMetadata(agent, record);
      await enrichFromAgentCard(agent, record);
      agent.name ??= record.handle;
      agents.push(agent);
    }

    return {
      agents,
      meta: {
        ...metaBase,
        ok: true,
        agentCount: agents.length,
        fetchMs: Date.now() - started,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      agents: [],
      meta: {
        ...metaBase,
        fetchMs: Date.now() - started,
        error: msg,
      },
    };
  }
}

/**
 * Aggregates all enabled registries into one catalog payload (uncached).
 */
export async function buildMarketplaceCatalog(
  registries: RegistryConnection[],
): Promise<MarketplaceCatalogPayload> {
  if (registries.length === 0) {
    return { agents: [], sources: [], builtAt: new Date().toISOString(), tags: [] };
  }

  const settled = await Promise.allSettled(
    registries.map((r) => fetchRegistryCatalogSlice(r)),
  );

  const agents: MarketplaceAgent[] = [];
  const sources: RegistryCatalogSourceMeta[] = [];

  for (let i = 0; i < settled.length; i++) {
    const reg = registries[i]!;
    const result = settled[i]!;
    if (result.status === "fulfilled") {
      agents.push(...result.value.agents);
      sources.push(result.value.meta);
    } else {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      sources.push({
        registryId: reg.id,
        name: reg.name,
        url: registryBaseUrl(reg.url),
        ok: false,
        agentCount: 0,
        fetchMs: 0,
        error: reason,
      });
    }
  }

  const tagSet = new Set<string>();
  for (const a of agents) {
    for (const t of a.tags ?? []) tagSet.add(t);
  }

  return {
    agents,
    sources,
    builtAt: new Date().toISOString(),
    tags: [...tagSet].sort(),
  };
}

export async function invalidateMarketplaceCatalogCache(): Promise<void> {
  await cacheInvalidate("marketplace:catalog*");
}

export { MARKETPLACE_CATALOG_CACHE_KEY };
