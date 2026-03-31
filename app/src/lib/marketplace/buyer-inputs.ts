// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Buyer configuration for marketplace — shared logic lives in `@pilox/buyer-config`
 * (packages/pilox-buyer-config); JSON Schema: docs/schemas/pilox-buyer-input-item.v1.schema.json
 */

import {
  collectBuyerInputs as collectBuyerInputsRaw,
  mergeEnvPrefillLines as mergeEnvPrefillLinesRaw,
  publisherDeclaresEnvKeys as publisherDeclaresEnvKeysRaw,
} from "@pilox/buyer-config";
import type { MarketplaceBuyerInput } from "./types";

/** Merge registry record + Agent Card declarations; later sources override same id/key/label. */
export function collectBuyerInputs(
  record: Record<string, unknown> | null | undefined,
  agentCard: unknown | null | undefined,
): MarketplaceBuyerInput[] {
  return collectBuyerInputsRaw(record, agentCard) as MarketplaceBuyerInput[];
}

/** Env lines `KEY=` for manifest required keys + publisher env-ish inputs (deduped). */
export function mergeEnvPrefillLines(
  manifestRequired: string[],
  publisherInputs: MarketplaceBuyerInput[] | undefined,
): string {
  return mergeEnvPrefillLinesRaw(
    manifestRequired,
    publisherInputs as unknown as Record<string, unknown>[] | undefined,
  );
}

export function publisherDeclaresEnvKeys(inputs: MarketplaceBuyerInput[] | undefined): boolean {
  return publisherDeclaresEnvKeysRaw(inputs as unknown as Record<string, unknown>[] | undefined);
}
