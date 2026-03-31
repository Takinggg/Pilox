// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { fetchTextWithSsrfGuard } from "@/lib/egress-ssrf-guard";
import type { RegistryConnection } from "./catalog";
import { MARKETPLACE_RECORD_TIMEOUT_MS } from "./constants";

function registryBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function buildAuthHeaders(authToken: string | null): Record<string, string> {
  if (!authToken) return {};
  return { Authorization: `Bearer ${authToken}` };
}

export type ResolvedMarketplaceRecord = {
  record: Record<string, unknown>;
  agentCard: unknown | null;
  registryName: string;
  registryUrl: string;
  registryId: string;
};

export type ResolveMarketplaceOpts = {
  /** When set, only this registry is queried (disambiguates duplicate handles). */
  registryId?: string;
};

/**
 * Walks connected registries in order until the handle resolves.
 */
export async function resolveHandleAcrossRegistries(
  handle: string,
  registries: RegistryConnection[],
  opts?: ResolveMarketplaceOpts,
): Promise<ResolvedMarketplaceRecord | null> {
  const list = opts?.registryId
    ? registries.filter((r) => r.id === opts.registryId)
    : registries;
  if (opts?.registryId && list.length === 0) return null;

  for (const reg of list) {
    const base = registryBaseUrl(reg.url);
    const headers = buildAuthHeaders(reg.authToken);
    try {
      const recRes = await fetch(`${base}/v1/records/${encodeURIComponent(handle)}`, {
        headers,
        signal: AbortSignal.timeout(MARKETPLACE_RECORD_TIMEOUT_MS * 2),
      });
      if (!recRes.ok) continue;

      const record = (await recRes.json()) as Record<string, unknown>;
      let agentCard: unknown | null = null;
      const acu = record.agentCardUrl;
      if (typeof acu === "string") {
        try {
          const fr = await fetchTextWithSsrfGuard(acu, {
            timeoutMs: MARKETPLACE_RECORD_TIMEOUT_MS * 2,
            maxBytes: 512_000,
            headers: { Accept: "application/json" },
          });
          if (fr.ok) {
            try {
              agentCard = JSON.parse(fr.text) as unknown;
            } catch {
              agentCard = null;
            }
          }
        } catch {
          /* optional */
        }
      }

      return {
        record,
        agentCard,
        registryName: reg.name,
        registryUrl: base,
        registryId: reg.id,
      };
    } catch {
      continue;
    }
  }
  return null;
}
