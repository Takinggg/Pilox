// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import type { Agent } from "@/db/schema";

/** Compact pill for agent tables/cards (English labels). */
/** Plain label for settings tables (English). */
export function formatAgentSourceType(
  sourceType: Agent["sourceType"] | null | undefined,
): string {
  return getAgentSourcePill(sourceType)?.label ?? "Local";
}

export function getAgentSourcePill(
  sourceType: Agent["sourceType"] | null | undefined,
): { label: string; className: string } | null {
  if (!sourceType || sourceType === "local") return null;
  switch (sourceType) {
    case "url-import":
      return {
        label: "Imported",
        className: "bg-[#3B82F61A] text-[#3B82F6]",
      };
    case "marketplace":
      return {
        label: "Marketplace",
        className: "bg-[#22C55E1A] text-[#22C55E]",
      };
    case "registry":
      return {
        label: "Registry",
        className: "bg-[#8B5CF61A] text-[#A78BFA]",
      };
    default:
      return null;
  }
}

export type MarketplaceOriginStored = {
  registryHandle: string;
  registryId?: string;
  registryName?: string;
  registryUrl?: string;
};

export function parseMarketplaceOrigin(
  config: unknown,
): MarketplaceOriginStored | null {
  if (!config || typeof config !== "object") return null;
  const mp = (config as Record<string, unknown>).marketplace;
  if (!mp || typeof mp !== "object") return null;
  const o = mp as Record<string, unknown>;
  const handle =
    typeof o.registryHandle === "string" ? o.registryHandle.trim() : "";
  if (!handle) return null;
  return {
    registryHandle: handle,
    registryId: typeof o.registryId === "string" ? o.registryId : undefined,
    registryName:
      typeof o.registryName === "string" ? o.registryName : undefined,
    registryUrl:
      typeof o.registryUrl === "string" ? o.registryUrl : undefined,
  };
}
