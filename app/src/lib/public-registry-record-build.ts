// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import type { AgentConfig } from "@/lib/agent-config-schema";
import {
  defaultPublicAgentCardUrl,
  getPiloxAuthOrigin,
} from "@/lib/public-registry-hub";

/** Registry schema requires `handle` minLength 8. */
const MIN_HANDLE_LEN = 8;

export function buildPiloxRegistryRecordForAgent(args: {
  tenantKey: string;
  slug: string;
  config: AgentConfig;
}): Record<string, unknown> {
  const override = args.config.metadata?.publicRegistryAgentCardUrl?.trim();
  const agentCardUrl = override || defaultPublicAgentCardUrl();
  if (!agentCardUrl) {
    throw new Error("agent_card_url_required");
  }
  const handle = `${args.tenantKey}/${args.slug}`;
  if (handle.length < MIN_HANDLE_LEN) {
    throw new Error("handle_too_short");
  }
  const origin = getPiloxAuthOrigin();
  const meshDescriptorUrl = origin
    ? `${origin}/.well-known/pilox-mesh.json`
    : undefined;

  const rec: Record<string, unknown> = {
    schema: "pilox-registry-record-v1",
    handle,
    updatedAt: new Date().toISOString(),
    agentCardUrl,
    capabilities: ["a2a-jsonrpc"],
  };
  if (meshDescriptorUrl) rec.meshDescriptorUrl = meshDescriptorUrl;
  return rec;
}
