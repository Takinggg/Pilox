// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Multi-provider LLM request router.
 *
 * Dispatches chat completion requests to the correct provider (local container,
 * OpenAI, Anthropic, Azure OpenAI, or any OpenAI-compatible endpoint).
 */

import type { LlmProvider } from "@/db/schema";
import type { AgentConfig } from "./agent-config-schema";
import { decryptSecret } from "./secrets-crypto";
import { db } from "@/db";
import { secrets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("llm-router");

// ── Types ────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  model: string;
  messages: ChatMessage[];
  stream: boolean;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
}

export interface LlmRouteResult {
  response: Response;
  costPerInputToken: number;
  costPerOutputToken: number;
  providerType: string;
}

// ── Provider Interface ───────────────────────────────

export interface LlmProviderAdapter {
  buildRequest(req: LlmRequest, config: ProviderConfig): {
    url: string;
    headers: Record<string, string>;
    body: unknown;
  };
  /** Format name for the SSE/NDJSON response. */
  responseFormat: "openai-sse" | "anthropic-sse" | "ollama-ndjson";
}

export interface ProviderConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
}

// ── Provider Implementations ─────────────────────────

const localProvider: LlmProviderAdapter = {
  responseFormat: "ollama-ndjson",
  buildRequest(req, config) {
    return {
      url: `${config.baseUrl}/api/chat`,
      headers: { "Content-Type": "application/json" },
      body: {
        model: config.model,
        messages: req.messages,
        stream: req.stream,
        ...(req.temperature !== undefined && {
          options: {
            temperature: req.temperature,
            ...(req.topP !== undefined && { top_p: req.topP }),
            ...(req.maxTokens !== undefined && { num_predict: req.maxTokens }),
            ...(req.stopSequences?.length && { stop: req.stopSequences }),
          },
        }),
      },
    };
  },
};

const openaiProvider: LlmProviderAdapter = {
  responseFormat: "openai-sse",
  buildRequest(req, config) {
    return {
      url: `${config.baseUrl}/v1/chat/completions`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: {
        model: config.model,
        messages: req.messages,
        stream: req.stream,
        ...(req.temperature !== undefined && { temperature: req.temperature }),
        ...(req.topP !== undefined && { top_p: req.topP }),
        ...(req.maxTokens !== undefined && { max_tokens: req.maxTokens }),
        ...(req.frequencyPenalty !== undefined && { frequency_penalty: req.frequencyPenalty }),
        ...(req.presencePenalty !== undefined && { presence_penalty: req.presencePenalty }),
        ...(req.stopSequences?.length && { stop: req.stopSequences }),
      },
    };
  },
};

const anthropicProvider: LlmProviderAdapter = {
  responseFormat: "anthropic-sse",
  buildRequest(req, config) {
    // Anthropic uses system message separately
    const systemMsg = req.messages.find((m) => m.role === "system");
    const chatMessages = req.messages.filter((m) => m.role !== "system");

    return {
      url: `${config.baseUrl}/v1/messages`,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: {
        model: config.model,
        messages: chatMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        ...(systemMsg && { system: systemMsg.content }),
        stream: req.stream,
        ...(req.temperature !== undefined && { temperature: req.temperature }),
        ...(req.topP !== undefined && { top_p: req.topP }),
        max_tokens: req.maxTokens ?? 4096,
        ...(req.stopSequences?.length && { stop_sequences: req.stopSequences }),
      },
    };
  },
};

const azureProvider: LlmProviderAdapter = {
  responseFormat: "openai-sse",
  buildRequest(req, config) {
    // Azure uses deployment name in URL, not in body
    const deploymentUrl = `${config.baseUrl}/openai/deployments/${config.model}/chat/completions?api-version=2024-10-21`;
    return {
      url: deploymentUrl,
      headers: {
        "Content-Type": "application/json",
        "api-key": config.apiKey ?? "",
      },
      body: {
        messages: req.messages,
        stream: req.stream,
        ...(req.temperature !== undefined && { temperature: req.temperature }),
        ...(req.topP !== undefined && { top_p: req.topP }),
        ...(req.maxTokens !== undefined && { max_tokens: req.maxTokens }),
        ...(req.frequencyPenalty !== undefined && { frequency_penalty: req.frequencyPenalty }),
        ...(req.presencePenalty !== undefined && { presence_penalty: req.presencePenalty }),
        ...(req.stopSequences?.length && { stop: req.stopSequences }),
      },
    };
  },
};

/** Custom OpenAI-compatible endpoint (e.g. LiteLLM, Together, Groq). */
const customProvider: LlmProviderAdapter = {
  ...openaiProvider,
};

// ── Provider Registry ────────────────────────────────

const PROVIDERS: Record<string, LlmProviderAdapter> = {
  local: localProvider,
  openai: openaiProvider,
  anthropic: anthropicProvider,
  azure: azureProvider,
  custom: customProvider,
};

// ── Router ───────────────────────────────────────────

/**
 * Resolve the API key for a provider by decrypting the linked secret.
 */
async function resolveApiKey(provider: LlmProvider): Promise<string | undefined> {
  if (!provider.apiKeySecretId) return undefined;

  const [secret] = await db
    .select({ encryptedValue: secrets.encryptedValue })
    .from(secrets)
    .where(eq(secrets.id, provider.apiKeySecretId))
    .limit(1);

  if (!secret) {
    log.warn("llm_router.secret_not_found", { secretId: provider.apiKeySecretId });
    return undefined;
  }

  return decryptSecret(secret.encryptedValue);
}

/**
 * Look up cost rates from the provider's models JSONB.
 */
function resolveCostRates(
  provider: LlmProvider,
  model: string,
): { costPerInputToken: number; costPerOutputToken: number } {
  const models = provider.models ?? [];
  const match = models.find((m) => m.id === model || m.name === model);
  return {
    costPerInputToken: match?.costPerInputToken ?? 0,
    costPerOutputToken: match?.costPerOutputToken ?? 0,
  };
}

/**
 * Route a chat completion request through the correct provider.
 *
 * @param provider - The LLM provider DB record (null for local container agents).
 * @param agentConfig - The agent's typed config.
 * @param request - The chat completion request.
 * @param localBaseUrl - For local agents: the container's base URL.
 */
export async function routeLlmRequest(
  provider: LlmProvider | null,
  agentConfig: AgentConfig,
  request: LlmRequest,
  localBaseUrl?: string,
): Promise<LlmRouteResult> {
  const providerType = provider?.type ?? agentConfig.llm?.providerType ?? "local";
  const adapter = PROVIDERS[providerType] ?? localProvider;

  let baseUrl: string;
  let apiKey: string | undefined;

  if (provider) {
    baseUrl = provider.baseUrl ?? getDefaultBaseUrl(providerType);
    apiKey = await resolveApiKey(provider);
  } else if (localBaseUrl) {
    baseUrl = localBaseUrl;
  } else {
    throw new Error("No provider or local base URL specified");
  }

  const model = request.model || agentConfig.llm?.model || "llama3.2";

  const { url, headers, body } = adapter.buildRequest(request, {
    baseUrl,
    apiKey,
    model,
  });

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(
      (agentConfig.runtime?.timeoutSeconds ?? 300) * 1000,
    ),
  });

  const costs = provider
    ? resolveCostRates(provider, model)
    : { costPerInputToken: 0, costPerOutputToken: 0 };

  return {
    response,
    ...costs,
    providerType,
  };
}

function getDefaultBaseUrl(providerType: string): string {
  switch (providerType) {
    case "openai": return "https://api.openai.com";
    case "anthropic": return "https://api.anthropic.com";
    default: return "http://localhost:11434";
  }
}

/**
 * Get the response format for a provider type.
 */
export function getProviderResponseFormat(
  providerType: string,
): "openai-sse" | "anthropic-sse" | "ollama-ndjson" {
  const adapter = PROVIDERS[providerType];
  return adapter?.responseFormat ?? "ollama-ndjson";
}
