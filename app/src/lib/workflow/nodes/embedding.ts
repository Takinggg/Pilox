// SPDX-License-Identifier: BUSL-1.1
import { createModuleLogger } from "../../logger";
import { getOllamaBaseUrl } from "../../runtime-instance-config";
import { fetchWithTimeout } from "../net";
import { substituteVariables } from "../graph";
import type { WorkflowNode } from "../types";

const log = createModuleLogger("workflow-embedding");

/**
 * Embedding node — generates vector embeddings from text.
 * Uses Ollama /api/embeddings or OpenAI-compatible /v1/embeddings.
 */
export async function executeEmbeddingNode(
  node: WorkflowNode,
  variables: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  const model = node.data.model || "nomic-embed-text";
  const input = node.data.template
    ? substituteVariables(node.data.template, variables)
    : String(variables.lastOutput ?? variables.input ?? "");

  const provider = node.data.provider ?? "ollama";
  let url: string;
  let body: Record<string, unknown>;
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (provider === "ollama") {
    url = `${getOllamaBaseUrl()}/api/embeddings`;
    body = { model, prompt: input };
  } else {
    // OpenAI-compatible
    const apiKey = process.env[`${provider.toUpperCase()}_API_KEY`];
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    const vllmUrl = process.env.VLLM_URL || "http://vllm:8000";
    url = provider === "vllm" ? `${vllmUrl}/v1/embeddings` : `https://api.openai.com/v1/embeddings`;
    body = { model, input };
  }

  const res = await fetchWithTimeout(url, { method: "POST", headers, body: JSON.stringify(body) }, timeoutMs);
  if (!res.ok) throw new Error(`Embedding "${model}" returned ${res.status}`);

  const json = await res.json();
  const embedding = json.embedding ?? json.data?.[0]?.embedding ?? [];
  variables.lastOutput = embedding;
  return embedding;
}
