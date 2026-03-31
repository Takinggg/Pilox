// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

export type MarketplacePricingEnforcement = "none" | "warn";

import { effectiveRuntimeString } from "@/lib/runtime-instance-config";

/** Set `MARKETPLACE_PRICING_ENFORCEMENT=warn` to surface UI hints when catalog entries lack pricing metadata. */
export function getMarketplacePricingEnforcement(): MarketplacePricingEnforcement {
  const r = effectiveRuntimeString("MARKETPLACE_PRICING_ENFORCEMENT").trim();
  const v = r || process.env.MARKETPLACE_PRICING_ENFORCEMENT;
  return v === "warn" ? "warn" : "none";
}
