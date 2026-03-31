/**
 * Model Router — Route agents to quantized model variants based on tier.
 *
 * Maps inference tiers to preferred quantization levels:
 *   - low:    Q4 (2GB VRAM) — simple tasks, chatbots, classifiers
 *   - medium: Q8 (4-5GB VRAM) — general purpose, default
 *   - high:   FP16/Q8 (8GB+ VRAM) — reasoning, coding, complex tasks
 *
 * The proxy reads the agent's tier from Redis, resolves the best available
 * model variant, and rewrites the model name in the request body.
 */

import { getRedis } from "./redis";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("model-router");

// Tier → preferred quantization suffixes (in order of preference)
const TIER_QUANT_MAP: Record<string, string[]> = {
  low: ["q4_0", "q4_K_M", "q4_K_S"],
  medium: ["q8_0", "q5_K_M", "q5_K_S"],
  high: ["f16", "q8_0"],
};

/**
 * Resolve the best model variant for a given base model and tier.
 *
 * E.g. resolveModel("llama3.2", "low", availableModels) → "llama3.2:q4_0"
 * Falls back to the exact requested model if no quantized variant is available.
 */
export function resolveModel(
  requestedModel: string,
  tier: string,
  availableModels: string[]
): string {
  // If model already includes a quantization tag (e.g. "llama3.2:q4_0"), use it as-is
  if (requestedModel.includes(":") && !requestedModel.endsWith(":latest")) {
    return requestedModel;
  }

  const baseName = requestedModel.split(":")[0];
  const quantPrefs = TIER_QUANT_MAP[tier] || TIER_QUANT_MAP.medium;

  // Try each quantization level in order of preference
  for (const quant of quantPrefs) {
    const candidate = `${baseName}:${quant}`;
    if (availableModels.includes(candidate)) {
      return candidate;
    }
  }

  // Fall back to requested model
  return requestedModel;
}

/**
 * Get available models from Ollama via Redis cache (set by the app).
 * Falls back to empty list if unavailable.
 */
export async function getAvailableModels(): Promise<string[]> {
  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    const cached = await r.get("pilox:models:available");
    if (cached) return JSON.parse(cached);
  } catch {
    // Redis unavailable
  }
  return [];
}

/**
 * Refresh the available models list from Ollama and cache in Redis.
 * Call periodically (e.g. every 5 minutes) from the app.
 */
export async function refreshAvailableModels(): Promise<string[]> {
  try {
    const port = process.env.INFERENCE_PORT || "11434";
    const resp = await fetch(`http://127.0.0.1:${port}/api/tags`);
    if (!resp.ok) return [];

    const data = await resp.json();
    const models: string[] = (data.models || []).map((m: { name: string }) => m.name);

    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    await r.set("pilox:models:available", JSON.stringify(models), "EX", 300);

    log.info("Refreshed available models", { count: models.length });
    return models;
  } catch (err) {
    log.error("Failed to refresh models", { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

/**
 * Resolve the best model for an agent based on its tier.
 * Convenience function combining resolveModel + getAvailableModels.
 */
export async function resolveModelForAgent(
  requestedModel: string,
  tier: string
): Promise<string> {
  const models = await getAvailableModels();
  return resolveModel(requestedModel, tier, models);
}
