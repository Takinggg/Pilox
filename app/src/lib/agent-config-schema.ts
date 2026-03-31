// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Structured agent configuration schema.
 *
 * Replaces the untyped `Record<string, unknown>` on `agents.config` with
 * validated Zod schemas covering LLM, tools, memory, guardrails, budget,
 * runtime, A2A, and metadata.
 */

import { z } from "zod";

// ── LLM Configuration ────────────────────────────────

export const llmConfigSchema = z.object({
  /** Reference to a llm_providers row (optional — local agents skip this). */
  providerId: z.string().uuid().optional(),
  /** Provider type hint for routing when providerId is set. */
  providerType: z.enum(["openai", "anthropic", "azure", "custom", "local"]).optional(),
  /** Model identifier (e.g. "gpt-4o", "claude-sonnet-4-20250514", "llama3.2"). */
  model: z.string().max(255).optional(),
  /** System prompt prepended to every conversation. */
  systemPrompt: z.string().max(32768).optional(),
  /** Sampling temperature (0–2). */
  temperature: z.number().min(0).max(2).optional(),
  /** Nucleus sampling (0–1). */
  topP: z.number().min(0).max(1).optional(),
  /** Maximum tokens to generate per response. */
  maxTokens: z.number().int().min(1).max(1_000_000).optional(),
  /** Penalize tokens that already appeared (OpenAI/Anthropic). */
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  /** Penalize tokens based on presence in prior text. */
  presencePenalty: z.number().min(-2).max(2).optional(),
  /** Stop sequences that halt generation. */
  stopSequences: z.array(z.string().max(128)).max(8).optional(),
});

export type LlmConfig = z.infer<typeof llmConfigSchema>;

// ── Tool / MCP Configuration ─────────────────────────

export const toolConfigSchema = z.object({
  name: z.string().max(128),
  /** MCP server URL or built-in function name. */
  serverUrl: z.string().max(2048).optional(),
  type: z.enum(["mcp", "builtin", "function"]).default("mcp"),
  description: z.string().max(512).optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().default(true),
});

export type ToolConfig = z.infer<typeof toolConfigSchema>;

// ── Memory Configuration ─────────────────────────────

export const memoryConfigSchema = z.object({
  type: z.enum(["none", "buffer", "vector"]).default("none"),
  /** Vector store endpoint for RAG. */
  vectorStoreUrl: z.string().url().optional(),
  /** Number of messages to keep in buffer memory. */
  bufferSize: z.number().int().min(1).max(1000).optional(),
  /** TTL in seconds for memory entries. */
  ttlSeconds: z.number().int().min(0).optional(),
});

export type MemoryConfig = z.infer<typeof memoryConfigSchema>;

// ── Guardrails ───────────────────────────────────────

export const guardrailsConfigSchema = z.object({
  /** Hard cap on tokens per single request. */
  maxTokensPerRequest: z.number().int().min(1).optional(),
  /** Content filter mode. */
  contentFilter: z.enum(["none", "basic", "strict"]).default("none"),
  /** Token rate limit per minute. */
  rateLimitTokensPerMin: z.number().int().min(0).optional(),
  /** Request rate limit per minute. */
  rateLimitRequestsPerMin: z.number().int().min(0).optional(),
});

export type GuardrailsConfig = z.infer<typeof guardrailsConfigSchema>;

// ── Budget ───────────────────────────────────────────

export const budgetConfigSchema = z.object({
  /** Maximum tokens per day (enforced via Redis counter). */
  maxTokensPerDay: z.number().int().min(0).optional(),
  /** Maximum cost in USD per month (enforced via DB aggregate). */
  maxCostPerMonth: z.number().min(0).optional(),
  /** Webhook URL called at 80% and 100% budget thresholds. */
  alertWebhook: z.string().url().max(2048).optional(),
});

export type BudgetConfig = z.infer<typeof budgetConfigSchema>;

// ── Runtime ──────────────────────────────────────────

export const runtimeConfigSchema = z.object({
  /** Port the agent listens on inside the container. */
  port: z.number().int().min(1).max(65535).optional(),
  /** Health check endpoint path. */
  healthPath: z.string().max(255).optional(),
  /** Chat API format: ollama NDJSON or openai SSE. */
  chatFormat: z.enum(["ollama", "openai"]).optional(),
  /** Docker restart policy. */
  restartPolicy: z.enum(["no", "always", "unless-stopped", "on-failure"]).optional(),
  /** Request timeout in seconds. */
  timeoutSeconds: z.number().int().min(1).max(3600).optional(),
  /** Max concurrent requests to the agent. */
  maxConcurrentRequests: z.number().int().min(1).max(10000).optional(),
});

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

// ── A2A (Agent-to-Agent) ─────────────────────────────

const a2aSkillSchema = z.object({
  id: z.string().max(128),
  name: z.string().max(255),
  description: z.string().max(2048),
  tags: z.array(z.string()).max(16),
  examples: z.array(z.string()).max(8).optional(),
  inputModes: z.array(z.string()).optional(),
  outputModes: z.array(z.string()).optional(),
});

export const a2aConfigSchema = z.object({
  protocolVersion: z.string().max(20).optional(),
  skills: z.array(a2aSkillSchema).max(64).optional(),
  defaultInputModes: z.array(z.string()).optional(),
  defaultOutputModes: z.array(z.string()).optional(),
  capabilities: z.object({
    streaming: z.boolean().optional(),
    pushNotifications: z.boolean().optional(),
    stateTransitionHistory: z.boolean().optional(),
  }).optional(),
});

export type A2aConfig = z.infer<typeof a2aConfigSchema>;

// ── Metadata ─────────────────────────────────────────

export const metadataConfigSchema = z.object({
  tags: z.array(z.string().max(64)).max(32).optional(),
  author: z.object({
    name: z.string().max(255),
    url: z.string().url().optional(),
  }).optional(),
  license: z.string().max(128).optional(),
  icon: z.string().max(2048).optional(),
  manifestVersion: z.string().max(50).optional(),
  /** Template identifier used during wizard creation. */
  template: z.string().max(128).optional(),
  /**
   * Slug under this instance's Hub tenant (`tenantKey/slug`). Set in agent Configuration when publishing to the global registry.
   */
  publicRegistrySlug: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  /** Optional override for registry record `agentCardUrl` (defaults to this Pilox's `/.well-known/agent-card.json`). */
  publicRegistryAgentCardUrl: z.string().url().max(2048).optional(),
});

export type MetadataConfig = z.infer<typeof metadataConfigSchema>;

// ── Full Agent Config ────────────────────────────────

export const agentConfigSchema = z.object({
  llm: llmConfigSchema.optional(),
  tools: z.array(toolConfigSchema).max(64).optional(),
  memory: memoryConfigSchema.optional(),
  guardrails: guardrailsConfigSchema.optional(),
  budget: budgetConfigSchema.optional(),
  runtime: runtimeConfigSchema.optional(),
  a2a: a2aConfigSchema.optional(),
  metadata: metadataConfigSchema.optional(),
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;

// ── Helpers ──────────────────────────────────────────

/** Parse and validate an agent config, returning a typed object. */
export function parseAgentConfig(raw: unknown): AgentConfig {
  return agentConfigSchema.parse(raw);
}

/** Safely parse an agent config, returning null on invalid input. */
export function safeParseAgentConfig(raw: unknown): AgentConfig | null {
  const result = agentConfigSchema.safeParse(raw);
  return result.success ? result.data : null;
}
