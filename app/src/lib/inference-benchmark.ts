// SPDX-License-Identifier: BUSL-1.1
// Inference benchmark — runs a short generation on the active backend
// and reports real tokens/s. Works with both Ollama and vLLM.
// No React dependencies. Fully testable.

import { getActiveBackend } from "./inference-backend";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("inference-benchmark");

const BENCHMARK_PROMPT = "Explain the concept of recursion in programming in exactly 3 sentences.";
const MAX_TOKENS = 128;
const TIMEOUT_MS = 120_000; // 2min max for very slow backends (AirLLM etc.)

export interface BenchmarkResult {
  backend: string;
  model: string;
  tokensGenerated: number;
  durationMs: number;
  tokensPerSec: number;
  firstTokenMs: number;
  success: boolean;
  error?: string;
}

/**
 * Run a short benchmark on the active inference backend.
 * Returns real measured tokens/s and time-to-first-token.
 */
export async function runInferenceBenchmark(
  modelId: string,
): Promise<BenchmarkResult> {
  // Use OLLAMA_URL / VLLM_URL from env (Docker networking), fallback to localhost
  const ollamaUrl = process.env.OLLAMA_URL || `http://127.0.0.1:${process.env.INFERENCE_PORT || "11434"}`;
  const vllmUrl = process.env.VLLM_URL || `http://127.0.0.1:8000`;
  const backend = await getActiveBackend();
  const baseUrl = backend === "vllm" ? vllmUrl : ollamaUrl;

  log.info("Starting benchmark", { backend, model: modelId });

  try {
    if (backend === "vllm") {
      return await benchmarkOpenAICompat(baseUrl, modelId, backend);
    } else {
      return await benchmarkOllama(baseUrl, modelId);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("Benchmark failed", { error: msg });
    return {
      backend,
      model: modelId,
      tokensGenerated: 0,
      durationMs: 0,
      tokensPerSec: 0,
      firstTokenMs: 0,
      success: false,
      error: msg,
    };
  }
}

// ── Ollama benchmark ────────────────────────────────
// Ollama's /api/generate returns eval_count + eval_duration in the final chunk.

async function benchmarkOllama(
  baseUrl: string,
  modelId: string,
): Promise<BenchmarkResult> {
  const t0 = performance.now();

  const resp = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelId,
      prompt: BENCHMARK_PROMPT,
      stream: true,
      options: { num_predict: MAX_TOKENS },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!resp.ok) {
    throw new Error(`Ollama returned ${resp.status}: ${await resp.text().catch(() => "")}`);
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let firstTokenMs = 0;
  let buffer = "";
  let finalData: {
    eval_count?: number;
    eval_duration?: number;
    total_duration?: number;
    prompt_eval_duration?: number;
  } | null = null;
  let tokenCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Ollama streams NDJSON (one JSON object per line)
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line);
        if (chunk.response && firstTokenMs === 0) {
          firstTokenMs = Math.round(performance.now() - t0);
        }
        if (chunk.response) tokenCount++;
        if (chunk.done) {
          finalData = chunk;
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  const totalMs = Math.round(performance.now() - t0);

  // Prefer Ollama's own measurements if available
  const evalCount = finalData?.eval_count ?? tokenCount;
  // Ollama reports eval_duration in nanoseconds
  const evalDurationMs = finalData?.eval_duration
    ? finalData.eval_duration / 1_000_000
    : totalMs;
  const promptEvalMs = finalData?.prompt_eval_duration
    ? finalData.prompt_eval_duration / 1_000_000
    : firstTokenMs;

  const tokPerSec = evalDurationMs > 0
    ? Math.round((evalCount / evalDurationMs) * 1000 * 10) / 10
    : 0;

  return {
    backend: "ollama",
    model: modelId,
    tokensGenerated: evalCount,
    durationMs: totalMs,
    tokensPerSec: tokPerSec,
    firstTokenMs: Math.round(promptEvalMs),
    success: true,
  };
}

// ── vLLM / OpenAI-compat benchmark ──────────────────
// vLLM exposes an OpenAI-compatible /v1/completions endpoint.
// We stream SSE and measure client-side.

async function benchmarkOpenAICompat(
  baseUrl: string,
  modelId: string,
  backend: string,
): Promise<BenchmarkResult> {
  const t0 = performance.now();

  const resp = await fetch(`${baseUrl}/v1/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelId,
      prompt: BENCHMARK_PROMPT,
      max_tokens: MAX_TOKENS,
      stream: true,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!resp.ok) {
    throw new Error(`${backend} returned ${resp.status}: ${await resp.text().catch(() => "")}`);
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let firstTokenMs = 0;
  let buffer = "";
  let tokenCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const payload = trimmed.slice(6);
      if (payload === "[DONE]") continue;

      try {
        const chunk = JSON.parse(payload);
        const text = chunk.choices?.[0]?.text;
        if (text) {
          if (firstTokenMs === 0) {
            firstTokenMs = Math.round(performance.now() - t0);
          }
          // Count tokens by whitespace split (rough but consistent)
          tokenCount += text.split(/\s+/).filter(Boolean).length || 1;
        }
        // If usage is reported in the final chunk
        if (chunk.usage?.completion_tokens) {
          tokenCount = chunk.usage.completion_tokens;
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  const totalMs = Math.round(performance.now() - t0);
  const genDurationMs = totalMs - firstTokenMs;
  const tokPerSec = genDurationMs > 0
    ? Math.round((tokenCount / genDurationMs) * 1000 * 10) / 10
    : 0;

  return {
    backend,
    model: modelId,
    tokensGenerated: tokenCount,
    durationMs: totalMs,
    tokensPerSec: tokPerSec,
    firstTokenMs,
    success: true,
  };
}
