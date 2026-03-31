// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import type { MarketplaceAgent } from "./types";

export type MarketplaceListSort = "name" | "handle";

function normUrl(u: string): string {
  return u.replace(/\/+$/, "");
}

/** Filter + sort full catalog before offset/limit (used by GET /api/marketplace). */
export function queryMarketplaceAgents(
  agents: MarketplaceAgent[],
  opts: {
    q: string;
    tags: string[];
    registryUrl?: string;
    sort: MarketplaceListSort;
  },
): MarketplaceAgent[] {
  let filtered = [...agents];
  const q = opts.q.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(
      (a) =>
        (a.name ?? "").toLowerCase().includes(q) ||
        (a.description ?? "").toLowerCase().includes(q) ||
        a.handle.toLowerCase().includes(q) ||
        (a.author ?? "").toLowerCase().includes(q) ||
        a.tags?.some((t) => t.toLowerCase().includes(q)),
    );
  }
  if (opts.tags.length > 0) {
    filtered = filtered.filter((a) => opts.tags.some((tag) => a.tags?.includes(tag)));
  }
  if (opts.registryUrl?.trim()) {
    const want = normUrl(opts.registryUrl.trim());
    filtered = filtered.filter((a) => normUrl(a.registryUrl) === want);
  }

  if (opts.sort === "handle") {
    filtered.sort((a, b) => a.handle.localeCompare(b.handle));
  } else {
    filtered.sort((a, b) =>
      (a.name ?? a.handle).localeCompare(b.name ?? b.handle, undefined, { sensitivity: "base" }),
    );
  }

  return filtered;
}
