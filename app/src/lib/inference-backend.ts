/**
 * Inference Backend Switcher — Switch between Ollama and vLLM.
 *
 * Both backends listen on localhost:11434, so the proxy and agents
 * are completely unaware of which backend is active.
 *
 * Switching:
 *   1. Stop current backend service
 *   2. Start new backend service
 *   3. Wait for health check
 *   4. Update env/config
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getRedis } from "./redis";
import { createModuleLogger } from "./logger";

const execFileAsync = promisify(execFile);
const log = createModuleLogger("inference-backend");

export type InferenceBackend = "ollama" | "vllm";

const SERVICE_MAP: Record<InferenceBackend, string> = {
  ollama: "pilox-inference",
  vllm: "pilox-inference-vllm",
};

/**
 * Get the currently active inference backend.
 */
export async function getActiveBackend(): Promise<InferenceBackend> {
  try {
    await execFileAsync("systemctl", ["is-active", "--quiet", "pilox-inference-vllm"], { timeout: 3_000 });
    return "vllm";
  } catch {
    // Default to ollama
    return "ollama";
  }
}

/**
 * Get health/status information about the inference backend.
 */
export async function getBackendStatus(): Promise<{
  backend: InferenceBackend;
  running: boolean;
  models: string[];
}> {
  const backend = await getActiveBackend();
  const service = SERVICE_MAP[backend];
  let running = false;

  try {
    await execFileAsync("systemctl", ["is-active", "--quiet", service], { timeout: 3_000 });
    running = true;
  } catch {
    // not running
  }

  let models: string[] = [];
  if (running) {
    try {
      const port = process.env.INFERENCE_PORT || "11434";
      const endpoint = backend === "vllm" ? "/v1/models" : "/api/tags";
      const resp = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (backend === "vllm") {
          models = (data.data || []).map((m: { id: string }) => m.id);
        } else {
          models = (data.models || []).map((m: { name: string }) => m.name);
        }
      }
    } catch {
      // inference service not responding
    }
  }

  return { backend, running, models };
}

/**
 * Switch the inference backend. Stops the current and starts the new one.
 * Returns true on success.
 */
export async function switchBackend(target: InferenceBackend): Promise<boolean> {
  const current = await getActiveBackend();
  if (current === target) {
    log.info("Already running target backend", { backend: target });
    return true;
  }

  const currentService = SERVICE_MAP[current];
  const targetService = SERVICE_MAP[target];

  log.info("Switching inference backend", { from: current, to: target });

  try {
    // Stop current
    await execFileAsync("systemctl", ["stop", currentService], { timeout: 30_000 });
    await execFileAsync("systemctl", ["disable", currentService], { timeout: 5_000 });

    // Start target
    await execFileAsync("systemctl", ["enable", targetService], { timeout: 5_000 });
    await execFileAsync("systemctl", ["start", targetService], { timeout: 60_000 });

    // Wait for health check
    const port = process.env.INFERENCE_PORT || "11434";
    const maxRetries = 30;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const resp = await fetch(`http://127.0.0.1:${port}/`, {
          signal: AbortSignal.timeout(2_000),
        });
        if (resp.ok) {
          log.info("Backend switched successfully", { backend: target });

          // Update Redis for proxy to know the backend type
          try {
            const r = getRedis();
            if (r.status !== "ready") await r.connect();
            await r.set("pilox:inference:backend", target);
          } catch {
            // Non-critical
          }

          return true;
        }
      } catch {
        // not ready yet
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }

    log.error("Backend did not become healthy after switch", { backend: target });
    return false;
  } catch (err) {
    log.error("Backend switch failed", {
      error: err instanceof Error ? err.message : String(err),
    });

    // Try to restore previous backend
    try {
      await execFileAsync("systemctl", ["start", currentService], { timeout: 30_000 });
    } catch {
      log.error("Failed to restore previous backend");
    }

    return false;
  }
}
