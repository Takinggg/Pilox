// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Migrate legacy untyped agent config to the structured AgentConfig format.
 *
 * Old configs stored flat keys like `port`, `healthPath`, `chatFormat`,
 * `systemPrompt`, `model`, `restartPolicy`, `a2a`, `mcpTools`, `tags`,
 * `author`, `license`, `icon`, `manifestVersion`, `template`.
 *
 * This converter maps them into the new nested structure so existing agents
 * continue to work transparently.
 */

import type { AgentConfig } from "./agent-config-schema";
import { agentConfigSchema } from "./agent-config-schema";

/**
 * Convert a legacy flat config to the structured AgentConfig.
 * Unknown keys are silently dropped. Already-structured configs pass through.
 */
export function migrateAgentConfig(raw: unknown): AgentConfig {
  if (!raw || typeof raw !== "object") return {};

  const cfg = raw as Record<string, unknown>;

  // If it already has the new nested structure, validate and return
  if (cfg.llm || cfg.runtime || cfg.guardrails || cfg.budget) {
    const result = agentConfigSchema.safeParse(cfg);
    if (result.success) return result.data;
  }

  // Map legacy flat keys → new nested structure
  const migrated: AgentConfig = {};

  // ── Runtime ──
  const port = typeof cfg.port === "number" ? cfg.port : undefined;
  const healthPath = typeof cfg.healthPath === "string" ? cfg.healthPath : undefined;
  const chatFormat = cfg.chatFormat === "ollama" || cfg.chatFormat === "openai" ? cfg.chatFormat : undefined;
  const restartPolicy = typeof cfg.restartPolicy === "string" ? cfg.restartPolicy as AgentConfig["runtime"] extends { restartPolicy?: infer R } ? R : never : undefined;
  const timeoutSeconds = typeof cfg.timeoutSeconds === "number" ? cfg.timeoutSeconds : undefined;

  if (port || healthPath || chatFormat || restartPolicy || timeoutSeconds) {
    migrated.runtime = {
      ...(port !== undefined && { port }),
      ...(healthPath !== undefined && { healthPath }),
      ...(chatFormat !== undefined && { chatFormat }),
      ...(restartPolicy !== undefined && { restartPolicy }),
      ...(timeoutSeconds !== undefined && { timeoutSeconds }),
    };
  }

  // ── LLM ──
  const model = cfg.model as { provider?: string; name?: string } | undefined;
  const systemPrompt = typeof cfg.systemPrompt === "string" ? cfg.systemPrompt : undefined;

  if (model || systemPrompt) {
    migrated.llm = {
      ...(model?.name && { model: model.name }),
      ...(model?.provider && { providerType: mapLegacyProviderType(model.provider) }),
      ...(systemPrompt && { systemPrompt }),
    };
  }

  // ── A2A ──
  if (cfg.a2a && typeof cfg.a2a === "object") {
    migrated.a2a = cfg.a2a as AgentConfig["a2a"];
  }

  // ── Tools (legacy mcpTools) ──
  if (Array.isArray(cfg.mcpTools) && cfg.mcpTools.length > 0) {
    migrated.tools = cfg.mcpTools.map((t: Record<string, unknown>) => ({
      name: String(t.name ?? "unnamed"),
      type: "mcp" as const,
      serverUrl: typeof t.serverUrl === "string" ? t.serverUrl : undefined,
      description: typeof t.description === "string" ? t.description : undefined,
      enabled: true,
    }));
  }

  // ── Metadata ──
  const tags = Array.isArray(cfg.tags) ? cfg.tags as string[] : undefined;
  const author = cfg.author as { name: string; url?: string } | undefined;
  const license = typeof cfg.license === "string" ? cfg.license : undefined;
  const icon = typeof cfg.icon === "string" ? cfg.icon : undefined;
  const manifestVersion = typeof cfg.manifestVersion === "string" ? cfg.manifestVersion : undefined;
  const template = typeof cfg.template === "string" ? cfg.template : undefined;

  if (tags || author || license || icon || manifestVersion || template) {
    migrated.metadata = {
      ...(tags && { tags }),
      ...(author && { author }),
      ...(license && { license }),
      ...(icon && { icon }),
      ...(manifestVersion && { manifestVersion }),
      ...(template && { template }),
    };
  }

  return migrated;
}

function mapLegacyProviderType(provider: string): AgentConfig["llm"] extends { providerType?: infer T } ? T : never {
  const map: Record<string, "openai" | "anthropic" | "azure" | "custom" | "local"> = {
    ollama: "local",
    openai: "openai",
    anthropic: "anthropic",
    azure: "azure",
  };
  return (map[provider.toLowerCase()] ?? "local") as ReturnType<typeof mapLegacyProviderType>;
}

/** Legacy flat keys that indicate old-format config. */
const LEGACY_KEYS = new Set([
  "port", "healthPath", "chatFormat", "systemPrompt", "model",
  "restartPolicy", "mcpTools", "tags", "author", "license",
  "icon", "manifestVersion", "template", "timeoutSeconds",
]);

/**
 * Get a typed AgentConfig from a raw DB config value.
 * Always succeeds — invalid data is silently migrated/cleaned.
 */
export function getTypedConfig(raw: unknown): AgentConfig {
  if (!raw || typeof raw !== "object") return {};

  const cfg = raw as Record<string, unknown>;

  // Detect legacy flat config by checking for known flat keys
  const hasLegacyKeys = Object.keys(cfg).some((k) => LEGACY_KEYS.has(k));
  if (hasLegacyKeys) return migrateAgentConfig(raw);

  // Fast path for new-format configs
  const direct = agentConfigSchema.safeParse(raw);
  if (direct.success) return direct.data;

  // Fall back to migration as last resort
  return migrateAgentConfig(raw);
}
