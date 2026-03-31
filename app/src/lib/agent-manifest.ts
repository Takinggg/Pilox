// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * pilox-agent-manifest-v1 — portable agent package format.
 *
 * Parse, validate, and convert between manifest YAML/JSON and the DB agent row.
 */

import { z } from "zod";
import type { Agent } from "@/db/schema";
import type { AgentConfig } from "@/lib/agent-config-schema";
import { getTypedConfig } from "@/lib/agent-config-migrate";

// ── Zod Schema ────────────────────────────────────────

const skillSchema = z.object({
  id: z.string().max(128),
  name: z.string().max(255),
  description: z.string().max(2048),
  tags: z.array(z.string()).max(16),
  examples: z.array(z.string()).max(8).optional(),
  inputModes: z.array(z.string()).optional(),
  outputModes: z.array(z.string()).optional(),
});

const mcpToolSchema = z.object({
  name: z.string().max(128),
  serverUrl: z.string().url().optional(),
  description: z.string().max(512).optional(),
});

export const piloxAgentManifestSchema = z.object({
  schema: z.literal("pilox-agent-manifest-v1"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),

  // Identity
  name: z.string().min(1).max(255),
  description: z.string().max(4096).optional(),
  author: z.object({
    name: z.string().max(255),
    url: z.string().url().optional(),
  }).optional(),
  license: z.string().max(128).optional(),
  tags: z.array(z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/)).max(32).optional(),
  icon: z.string().max(2048).optional(),

  // Runtime
  runtime: z.object({
    image: z.string().min(1).max(500).regex(/^[a-zA-Z0-9._/:@-]+$/),
    envVars: z.record(z.string(), z.string()).optional(),
    envVarsRequired: z.array(z.string().max(128)).max(32).optional(),
    cpuLimit: z.string().regex(/^\d+(\.\d+)?$/).optional(),
    memoryLimit: z.string().regex(/^\d+(m|g)$/i).optional(),
    gpuRequired: z.boolean().optional(),
    confidential: z.boolean().optional(),
    restartPolicy: z.enum(["no", "always", "unless-stopped", "on-failure"]).optional(),
  }),

  // Model
  model: z.object({
    provider: z.string().max(64).optional(),
    name: z.string().max(255).optional(),
    systemPrompt: z.string().max(32768).optional(),
    inferenceTier: z.enum(["low", "medium", "high"]).optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  }).optional(),

  // A2A
  a2a: z.object({
    protocolVersion: z.string().max(20).optional(),
    skills: z.array(skillSchema).max(64).optional(),
    defaultInputModes: z.array(z.string()).optional(),
    defaultOutputModes: z.array(z.string()).optional(),
    capabilities: z.object({
      streaming: z.boolean().optional(),
      pushNotifications: z.boolean().optional(),
      stateTransitionHistory: z.boolean().optional(),
    }).optional(),
  }).optional(),

  // MCP Tools
  mcpTools: z.array(mcpToolSchema).max(32).optional(),

  // Dependencies
  dependencies: z.object({
    agents: z.array(z.string()).max(16).optional(),
    services: z.array(z.string()).max(16).optional(),
  }).optional(),
});

export type PiloxAgentManifest = z.infer<typeof piloxAgentManifestSchema>;

// ── Manifest → Agent creation payload ─────────────────

export interface ManifestToAgentOpts {
  manifest: PiloxAgentManifest;
  overrides?: {
    name?: string;
    description?: string;
    envVars?: Record<string, string>;
    cpuLimit?: string;
    memoryLimit?: string;
    gpuEnabled?: boolean;
    confidential?: boolean;
    inferenceTier?: "low" | "medium" | "high";
  };
}

export function manifestToAgentPayload(opts: ManifestToAgentOpts) {
  const { manifest: m, overrides: o } = opts;

  const envVars = { ...m.runtime.envVars, ...o?.envVars };

  const config: AgentConfig = {
    llm: m.model ? {
      providerType: (m.model.provider as NonNullable<AgentConfig["llm"]>["providerType"]) ?? "local",
      model: m.model.name,
      systemPrompt: m.model.systemPrompt,
      ...(m.model.parameters as { temperature?: number; topP?: number; maxTokens?: number } ?? {}),
    } : { providerType: "local" as const },
    tools: m.mcpTools?.map((t) => ({
      name: t.name,
      type: "mcp" as const,
      serverUrl: t.serverUrl,
      description: t.description,
      enabled: true,
    })),
    runtime: {
      restartPolicy: m.runtime.restartPolicy ?? "unless-stopped",
    },
    a2a: m.a2a ? {
      protocolVersion: m.a2a.protocolVersion,
      skills: m.a2a.skills,
      capabilities: m.a2a.capabilities,
    } : undefined,
    metadata: {
      tags: m.tags,
      author: m.author,
      license: m.license,
      icon: m.icon,
      manifestVersion: m.version,
    },
  };

  return {
    name: o?.name ?? m.name,
    description: o?.description ?? m.description,
    image: m.runtime.image,
    envVars: Object.keys(envVars).length > 0 ? envVars : undefined,
    cpuLimit: o?.cpuLimit ?? m.runtime.cpuLimit,
    memoryLimit: o?.memoryLimit ?? m.runtime.memoryLimit,
    gpuEnabled: o?.gpuEnabled ?? m.runtime.gpuRequired ?? false,
    confidential: o?.confidential ?? m.runtime.confidential ?? false,
    inferenceTier: o?.inferenceTier ?? m.model?.inferenceTier,
    config,
  };
}

// ── Agent DB row → Manifest ───────────────────────────

export function agentToManifest(agent: Agent): PiloxAgentManifest {
  const tc = getTypedConfig(agent.config as Record<string, unknown> | null | undefined);

  const modelParameters: Record<string, unknown> = {};
  if (tc.llm?.temperature != null) modelParameters.temperature = tc.llm.temperature;
  if (tc.llm?.topP != null) modelParameters.topP = tc.llm.topP;
  if (tc.llm?.maxTokens != null) modelParameters.maxTokens = tc.llm.maxTokens;
  if (tc.llm?.frequencyPenalty != null) modelParameters.frequencyPenalty = tc.llm.frequencyPenalty;
  if (tc.llm?.presencePenalty != null) modelParameters.presencePenalty = tc.llm.presencePenalty;
  if (tc.llm?.stopSequences?.length) modelParameters.stopSequences = tc.llm.stopSequences;

  return {
    schema: "pilox-agent-manifest-v1",
    version: tc.metadata?.manifestVersion ?? "1.0.0",
    name: agent.name,
    description: agent.description ?? undefined,
    author: tc.metadata?.author ?? undefined,
    license: tc.metadata?.license ?? undefined,
    tags: tc.metadata?.tags ?? undefined,
    icon: tc.metadata?.icon ?? undefined,
    runtime: {
      image: agent.image,
      envVars: (agent.envVars && Object.keys(agent.envVars).length > 0) ? agent.envVars : undefined,
      cpuLimit: agent.cpuLimit ?? undefined,
      memoryLimit: agent.memoryLimit ?? undefined,
      gpuRequired: agent.gpuEnabled ?? undefined,
      confidential: agent.confidential ?? undefined,
      restartPolicy: (tc.runtime?.restartPolicy as "no" | "always" | "unless-stopped" | "on-failure") ?? undefined,
    },
    model: tc.llm ? {
      provider: tc.llm.providerType,
      name: tc.llm.model,
      systemPrompt: tc.llm.systemPrompt,
      inferenceTier: agent.inferenceTier ?? undefined,
      parameters: Object.keys(modelParameters).length > 0 ? modelParameters : undefined,
    } : undefined,
    a2a: tc.a2a ? {
      protocolVersion: tc.a2a.protocolVersion,
      skills: tc.a2a.skills as z.infer<typeof skillSchema>[],
      capabilities: tc.a2a.capabilities,
    } : undefined,
    mcpTools: tc.tools?.map((t) => ({
      name: t.name,
      serverUrl: t.serverUrl,
      description: t.description,
    })),
  };
}

// ── Import preview (returned to UI) ───────────────────

export interface ImportPreview {
  sourceType: "github" | "yaml-url" | "agent-card" | "registry";
  manifest: PiloxAgentManifest;
  warnings: string[];
  envVarsRequired: string[];
}
