// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { mergeAgentCardJson } from "./agent-card-merge";
import { collectBuyerInputs } from "./buyer-inputs";
import { applyRegistryRecordMetadata } from "./record-metadata";
import type { ResolvedMarketplaceRecord } from "./resolve";
import type { MarketplaceAgent } from "./types";

/** Build the same normalized `MarketplaceAgent` shape as the catalog pipeline. */
export function marketplaceAgentFromResolved(resolved: ResolvedMarketplaceRecord): MarketplaceAgent {
  const record = resolved.record;
  if (typeof record.handle !== "string" || typeof record.agentCardUrl !== "string") {
    throw new Error("Invalid marketplace record: handle and agentCardUrl required");
  }
  const base = resolved.registryUrl.replace(/\/+$/, "");
  const agent: MarketplaceAgent = {
    handle: record.handle,
    registryName: resolved.registryName,
    registryUrl: base,
    registryId: resolved.registryId,
    agentCardUrl: record.agentCardUrl,
    tags: Array.isArray(record.capabilities)
      ? (record.capabilities as string[])
      : undefined,
    meshDescriptorUrl:
      typeof record.meshDescriptorUrl === "string" ? record.meshDescriptorUrl : undefined,
  };
  applyRegistryRecordMetadata(agent, record);
  mergeAgentCardJson(agent, resolved.agentCard);
  agent.name ??= record.handle;
  agent.buyerInputs = collectBuyerInputs(resolved.record, resolved.agentCard);
  return agent;
}
