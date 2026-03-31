// ── Ollama HTTP Client ────────────────────────────────
// Communicates with the Ollama REST API for local LLM management.

import { createModuleLogger } from "@/lib/logger";
import { getOllamaBaseUrl } from "@/lib/runtime-instance-config";

const log = createModuleLogger("ollama");

// ── Types ─────────────────────────────────────────────

export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
}

export interface PullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

export interface ModelDetails {
  modelfile: string;
  parameters: string;
  template: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
  model_info: Record<string, unknown>;
}

export interface RunningModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
  expires_at: string;
  size_vram: number;
}

// ── Helpers ───────────────────────────────────────────

function ollamaUrl(path: string): string {
  return `${getOllamaBaseUrl()}${path}`;
}

async function ollamaFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(ollamaUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch((err) => {
      log.warn("Failed to read Ollama error body", { err });
      return "Unknown error";
    });
    throw new OllamaError(
      `Ollama API error ${res.status}: ${text}`,
      res.status
    );
  }

  return res.json() as Promise<T>;
}

export class OllamaError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "OllamaError";
  }
}

// ── API Functions ─────────────────────────────────────

/**
 * List all locally available models.
 * GET /api/tags
 */
export async function listModels(): Promise<OllamaModel[]> {
  const data = await ollamaFetch<{ models: OllamaModel[] }>("/api/tags");
  return data.models ?? [];
}

/**
 * Pull (download) a model by name. Streams progress events to the optional
 * callback so callers can relay download percentage to the UI.
 * POST /api/pull
 */
export async function pullModel(
  name: string,
  onProgress?: (progress: PullProgress) => void
): Promise<void> {
  const res = await fetch(ollamaUrl("/api/pull"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, stream: true }),
  });

  if (!res.ok) {
    const text = await res.text().catch((err) => {
      log.warn("Failed to read Ollama pull error body", { err });
      return "Unknown error";
    });
    throw new OllamaError(
      `Ollama pull error ${res.status}: ${text}`,
      res.status
    );
  }

  if (!res.body) {
    throw new OllamaError("No response body from Ollama pull", 500);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Ollama sends newline-delimited JSON objects
      const lines = buffer.split("\n");
      // Keep the last (potentially incomplete) chunk in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const progress = JSON.parse(trimmed) as PullProgress;
          onProgress?.(progress);
        } catch {
          // Ignore malformed lines
        }
      }
    }

    // Process any remaining data in the buffer
    if (buffer.trim()) {
      try {
        const progress = JSON.parse(buffer.trim()) as PullProgress;
        onProgress?.(progress);
      } catch {
        // Ignore
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Delete a model from the local Ollama store.
 * DELETE /api/delete
 */
export async function deleteModel(name: string): Promise<void> {
  const res = await fetch(ollamaUrl("/api/delete"), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  if (!res.ok) {
    const text = await res.text().catch((err) => {
      log.warn("Failed to read Ollama delete error body", { err });
      return "Unknown error";
    });
    throw new OllamaError(
      `Ollama delete error ${res.status}: ${text}`,
      res.status
    );
  }
}

/**
 * Show detailed information about a model (parameters, template, quantization, etc.).
 * POST /api/show
 */
export async function showModel(name: string): Promise<ModelDetails> {
  return ollamaFetch<ModelDetails>("/api/show", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

/**
 * List models that are currently loaded into memory.
 * GET /api/ps
 */
export async function getRunningModels(): Promise<RunningModel[]> {
  const data = await ollamaFetch<{ models: RunningModel[] }>("/api/ps");
  return data.models ?? [];
}
