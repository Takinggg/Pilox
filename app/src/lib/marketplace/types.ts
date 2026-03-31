// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Shared types for the in-app agent marketplace (federated registry catalog).
 */

import type { MarketplacePricingDisplay } from "./pricing-display";

export type { MarketplacePricingDisplay };

export type MarketplaceSkill = {
  id: string;
  name: string;
  description: string;
  tags: string[];
};

/** What the deployer must supply (env, secrets, URLs, or free-text). See `buyer-inputs.ts`. */
export type MarketplaceBuyerInputKind = "env" | "secret" | "url" | "text" | "choice";

export type MarketplaceBuyerInput = {
  id: string;
  /** When set, value is typically injected as a container env var at deploy time. */
  key?: string;
  label: string;
  description?: string;
  kind: MarketplaceBuyerInputKind;
  required?: boolean;
  example?: string;
  options?: Array<{ value: string; label: string }>;
};

export type MarketplaceAgent = {
  handle: string;
  registryName: string;
  registryUrl: string;
  registryId: string;
  agentCardUrl: string;
  name?: string;
  description?: string;
  tags?: string[];
  author?: string;
  icon?: string;
  skills?: MarketplaceSkill[];
  /** A2A JSON-RPC URL when present on the Agent Card */
  jsonRpcUrl?: string;
  /** Protocol version from Agent Card when present */
  protocolVersion?: string;
  /** Registry record: mesh descriptor URL if any */
  meshDescriptorUrl?: string;
  /** Human docs (registry record or Agent Card). */
  documentationUrl?: string;
  /** Source repo / project URL when provided by registry or card. */
  sourceUrl?: string;
  /** Vendor or registry-reported version string. */
  version?: string;
  publishedAt?: string;
  updatedAt?: string;
  /** e.g. text, image — when registry publishes modality lists. */
  inputModalities?: string[];
  outputModalities?: string[];
  /** Optional display-only pricing (not enforced unless server policy adds checks later). */
  pricing?: MarketplacePricingDisplay;
  /**
   * Publisher-declared configuration checklist (registry record + Agent Card metadata).
   * Shown in catalog UI and import flow so buyers know what to pass to the agent.
   */
  buyerInputs?: MarketplaceBuyerInput[];
};

export type RegistryCatalogSourceMeta = {
  registryId: string;
  name: string;
  url: string;
  ok: boolean;
  agentCount: number;
  /** ms spent fetching this registry's slice */
  fetchMs: number;
  error?: string;
};

export type MarketplaceCatalogPayload = {
  agents: MarketplaceAgent[];
  sources: RegistryCatalogSourceMeta[];
  builtAt: string;
  /** Union of tags across the full catalog (for filter UI when using pagination). */
  tags?: string[];
};
