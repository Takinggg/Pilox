/**
 * Prompt Cache — Share system prompt KV cache across agents.
 *
 * Agents with identical system prompts share the same KV cache prefix
 * in vLLM (via --enable-prefix-caching). This module tracks prompt hashes
 * so agents with the same system prompt benefit from cached prefills.
 *
 * For Ollama: no native prefix caching, but tracking the hash still helps
 * with metrics and future optimizations.
 */

import crypto from "node:crypto";
import { getRedis } from "./redis";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("prompt-cache");

/**
 * Hash a system prompt to a cache key.
 * Uses SHA-256 truncated to 16 hex chars for compact storage.
 */
export function hashPrompt(systemPrompt: string): string {
  return crypto.createHash("sha256").update(systemPrompt).digest("hex").slice(0, 16);
}

/**
 * Register an agent's system prompt in the cache registry.
 * Tracks which agents share the same prompt prefix.
 */
export async function registerAgentPrompt(agentId: string, systemPrompt: string): Promise<string> {
  const hash = hashPrompt(systemPrompt);

  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();

    // Map agent → prompt hash (TTL 24h, refreshed on start)
    await r.set(`pilox:agent:prompt:${agentId}`, hash, "EX", 86400);
    // Map prompt hash → full prompt (for reference)
    await r.set(`pilox:prompt:${hash}`, systemPrompt, "EX", 86400);
    // Track how many agents use this prompt
    await r.sadd(`pilox:prompt:agents:${hash}`, agentId);

    return hash;
  } catch (err) {
    log.error("Failed to register prompt", { agentId, error: err instanceof Error ? err.message : String(err) });
    return hash;
  }
}

/**
 * Get the number of agents sharing a particular prompt.
 */
export async function getPromptShareCount(systemPrompt: string): Promise<number> {
  const hash = hashPrompt(systemPrompt);
  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    return await r.scard(`pilox:prompt:agents:${hash}`);
  } catch {
    return 0;
  }
}

/**
 * Remove an agent from the prompt cache registry (on stop/delete).
 */
export async function unregisterAgentPrompt(agentId: string): Promise<void> {
  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    const hash = await r.get(`pilox:agent:prompt:${agentId}`);
    if (hash) {
      await r.srem(`pilox:prompt:agents:${hash}`, agentId);
    }
    await r.del(`pilox:agent:prompt:${agentId}`);
  } catch {
    // Non-critical
  }
}
