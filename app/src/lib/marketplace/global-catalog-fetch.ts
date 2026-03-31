// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import type { MarketplaceAgent, RegistryCatalogSourceMeta } from "./types";

const DEFAULT_REGISTRY_ID = "pilox-global";
const FETCH_TIMEOUT_MS = 12_000;

function pickStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

function pickStrArr(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && x.length > 0);
  return out.length > 0 ? out : undefined;
}

/**
 * Normalize one row from `pilox-global-catalog.json` (Pilox landing) into a catalog agent.
 */
export function normalizeGlobalCatalogAgent(raw: unknown, catalogOrigin: string): MarketplaceAgent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const handle = pickStr(o.handle);
  if (!handle) return null;
  const agentCardUrl = pickStr(o.agentCardUrl);
  if (!agentCardUrl) return null;
  const origin = catalogOrigin.replace(/\/+$/, "");
  return {
    handle,
    registryName: pickStr(o.registryName) ?? "Pilox global catalog",
    registryUrl: pickStr(o.registryUrl) ?? origin,
    registryId: pickStr(o.registryId) ?? DEFAULT_REGISTRY_ID,
    agentCardUrl,
    name: pickStr(o.name),
    description: pickStr(o.description),
    tags: pickStrArr(o.tags),
    author: pickStr(o.author),
    icon: pickStr(o.icon),
    jsonRpcUrl: pickStr(o.jsonRpcUrl),
    meshDescriptorUrl: pickStr(o.meshDescriptorUrl),
    documentationUrl: pickStr(o.documentationUrl),
    sourceUrl: pickStr(o.sourceUrl),
    version: pickStr(o.version),
  };
}

export type GlobalCatalogFetchResult = {
  agents: MarketplaceAgent[];
  source: RegistryCatalogSourceMeta | null;
  builtAt?: string;
};

/**
 * Fetches public catalog JSON (same envelope as `GET /api/marketplace`) from the Pilox landing or any mirror.
 */
export async function fetchPiloxGlobalCatalogAgents(catalogUrl: string): Promise<GlobalCatalogFetchResult> {
  const out: GlobalCatalogFetchResult = { agents: [], source: null };
  let origin: string;
  try {
    origin = new URL(catalogUrl).origin;
  } catch {
    return out;
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(catalogUrl, {
      signal: ac.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);
    if (!res.ok) return out;
    const json = (await res.json()) as {
      data?: unknown[];
      meta?: { builtAt?: string; sources?: RegistryCatalogSourceMeta[] };
    };
    const builtAt = pickStr(json.meta?.builtAt);
    if (builtAt) out.builtAt = builtAt;

    const rows = Array.isArray(json.data) ? json.data : [];
    for (const row of rows) {
      const a = normalizeGlobalCatalogAgent(row, origin);
      if (a) out.agents.push(a);
    }

    if (out.agents.length > 0) {
      out.source = {
        registryId: DEFAULT_REGISTRY_ID,
        name: "Pilox global catalog",
        url: origin,
        ok: true,
        agentCount: out.agents.length,
        fetchMs: 0,
      };
    }
  } catch {
    clearTimeout(timer);
  }
  return out;
}
