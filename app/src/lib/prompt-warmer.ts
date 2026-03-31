/**
 * Prompt Warmer — Pre-warm inference cache on agent start/resume.
 *
 * When an agent starts or resumes, if it has a system prompt configured with
 * prewarmOnStart=true, we send a minimal inference request (num_predict: 1)
 * to load the model + system prompt KV cache into memory.
 *
 * This makes the first real request ~10x faster since the system prompt
 * tokens are already processed.
 */

import { registerAgentPrompt } from "./prompt-cache";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("prompt-warmer");

const INFERENCE_PORT = parseInt(process.env.INFERENCE_PORT || "11434");

/**
 * Pre-warm the inference cache for an agent's system prompt.
 * Sends a minimal request to process the system prompt tokens.
 * Non-blocking — errors are logged but don't propagate.
 */
export async function prewarmAgent(
  agentId: string,
  config: Record<string, unknown>
): Promise<void> {
  const systemPrompt = config.systemPrompt as string | undefined;
  const prewarmOnStart = config.prewarmOnStart as boolean | undefined;
  const model = (config.model as { name?: string } | undefined)?.name;

  if (!systemPrompt || !prewarmOnStart || !model) return;

  try {
    // Register the prompt hash for cache sharing
    await registerAgentPrompt(agentId, systemPrompt);

    log.info("Pre-warming agent", { agentId, model, promptLength: systemPrompt.length });

    // Send minimal inference request to load the system prompt into KV cache
    const resp = await fetch(`http://127.0.0.1:${INFERENCE_PORT}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        system: systemPrompt,
        prompt: ".",
        stream: false,
        options: { num_predict: 1 },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (resp.ok) {
      log.info("Agent pre-warmed", { agentId, model });
    } else {
      log.warn("Pre-warm request failed", { agentId, status: resp.status });
    }
  } catch (err) {
    log.error("Pre-warm error", {
      agentId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
