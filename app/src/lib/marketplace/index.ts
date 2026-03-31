// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

export {
  MARKETPLACE_CATALOG_CACHE_KEY,
  MARKETPLACE_CATALOG_TTL_SEC,
} from "./constants";
export {
  buildMarketplaceCatalog,
  fetchRegistryCatalogSlice,
  invalidateMarketplaceCatalogCache,
  type RegistryConnection,
} from "./catalog";
export {
  resolveHandleAcrossRegistries,
  type ResolvedMarketplaceRecord,
  type ResolveMarketplaceOpts,
} from "./resolve";
export { marketplaceAgentFromResolved } from "./resolved-to-agent";
export {
  formatMarketplacePricingLabel,
  parsePricingDisplay,
  type MarketplacePricingDisplay,
} from "./pricing-display";
export { getMarketplacePricingEnforcement, type MarketplacePricingEnforcement } from "./pricing-policy";
export { bumpMarketplaceDeployCount, getMarketplaceLocalStats } from "./local-stats";
export {
  collectBuyerInputs,
  mergeEnvPrefillLines,
  publisherDeclaresEnvKeys,
} from "./buyer-inputs";
export type {
  MarketplaceAgent,
  MarketplaceBuyerInput,
  MarketplaceBuyerInputKind,
  MarketplaceCatalogPayload,
  MarketplaceSkill,
  RegistryCatalogSourceMeta,
} from "./types";
export {
  syncAllConnectedRegistryStats,
  type RegistryStatsSyncRow,
} from "./sync-registry-stats";
