// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import type { MarketplaceAgent } from "./types";
import { parsePricingDisplay } from "./pricing-display";

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = record[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

/** Merge optional registry record fields into a catalog agent (best-effort). */
export function applyRegistryRecordMetadata(
  agent: MarketplaceAgent,
  record: Record<string, unknown>,
): void {
  agent.documentationUrl =
    pickString(record, ["documentationUrl", "docsUrl", "documentation"]) ?? agent.documentationUrl;
  agent.sourceUrl =
    pickString(record, ["sourceUrl", "repositoryUrl", "repoUrl", "codeUrl"]) ?? agent.sourceUrl;
  agent.version = pickString(record, ["version", "revision", "semver"]) ?? agent.version;
  agent.publishedAt =
    pickString(record, ["publishedAt", "createdAt", "releaseDate"]) ?? agent.publishedAt;
  agent.updatedAt = pickString(record, ["updatedAt", "modifiedAt", "lastUpdated"]) ?? agent.updatedAt;

  const pricing =
    parsePricingDisplay(record.pricing) ??
    parsePricingDisplay(record.piloxPricing) ??
    parsePricingDisplay(record.pricingHint);
  if (pricing) agent.pricing = pricing;

  const im = record.inputModalities ?? record.input_modalities;
  if (Array.isArray(im)) {
    agent.inputModalities = im.filter((x): x is string => typeof x === "string" && x.length > 0);
  }
  const om = record.outputModalities ?? record.output_modalities;
  if (Array.isArray(om)) {
    agent.outputModalities = om.filter((x): x is string => typeof x === "string" && x.length > 0);
  }
}
