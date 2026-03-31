// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { extractJsonRpcUrlFromAgentCard } from "./agent-card-endpoints";
import { parsePricingDisplay } from "./pricing-display";
import type { MarketplaceAgent, MarketplaceSkill } from "./types";

type AgentCardLike = {
  name?: string;
  description?: string;
  protocolVersion?: string;
  iconUrl?: string;
  provider?: { organization?: string };
  skills?: Array<{
    id: string;
    name: string;
    description: string;
    tags: string[];
  }>;
};

/** Apply an already-fetched Agent Card JSON to a marketplace agent (no network). */
export function mergeAgentCardJson(agent: MarketplaceAgent, card: unknown): void {
  if (!card || typeof card !== "object" || Array.isArray(card)) return;
  const c = card as AgentCardLike & Record<string, unknown>;

  agent.name = c.name ?? agent.name;
  agent.description = c.description ?? agent.description;
  agent.icon = c.iconUrl ?? agent.icon;
  agent.author = c.provider?.organization ?? agent.author;
  agent.protocolVersion =
    typeof c.protocolVersion === "string" ? c.protocolVersion : agent.protocolVersion;
  agent.jsonRpcUrl = extractJsonRpcUrlFromAgentCard(c) ?? agent.jsonRpcUrl;

  const doc =
    (typeof c.documentationUrl === "string" && c.documentationUrl) ||
    (typeof c.documentUrl === "string" && c.documentUrl);
  if (doc) agent.documentationUrl = agent.documentationUrl ?? doc;

  if (typeof c.sourceUrl === "string" && c.sourceUrl.trim()) {
    agent.sourceUrl = agent.sourceUrl ?? c.sourceUrl.trim();
  }

  if (c.metadata && typeof c.metadata === "object" && !Array.isArray(c.metadata)) {
    const m = c.metadata as Record<string, unknown>;
    const fromMeta =
      parsePricingDisplay(m.pricing) ??
      parsePricingDisplay(m.piloxPricing) ??
      parsePricingDisplay(m.catalogPricing);
    if (fromMeta) agent.pricing = { ...(agent.pricing ?? {}), ...fromMeta };
  }

  const cardPricing = parsePricingDisplay(c.pricing) ?? parsePricingDisplay(c.piloxPricing);
  if (cardPricing) agent.pricing = { ...(agent.pricing ?? {}), ...cardPricing };

  if (Array.isArray(c.skills)) {
    agent.skills = c.skills.map(
      (s, idx): MarketplaceSkill => ({
        id: typeof s.id === "string" && s.id ? s.id : `skill-${idx}`,
        name: s.name,
        description: s.description,
        tags: s.tags ?? [],
      }),
    );
    const skillTags = c.skills.flatMap((s) => s.tags ?? []);
    agent.tags = [...new Set([...(agent.tags ?? []), ...skillTags])];
  }
}
