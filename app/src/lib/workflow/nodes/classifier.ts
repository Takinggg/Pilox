// SPDX-License-Identifier: BUSL-1.1
import { createModuleLogger } from "../../logger";
import { fetchWithTimeout } from "../net";
import { substituteVariables } from "../graph";
import type { WorkflowNode } from "../types";

const log = createModuleLogger("workflow-classifier");

/**
 * Classifier node — zero-shot or fine-tuned text classification.
 * Routes to vLLM (HuggingFace models) or Ollama (if model supports classification).
 */
export async function executeClassifierNode(
  node: WorkflowNode,
  variables: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  const model = node.data.model || "cross-encoder/nli-deberta-v3-large";
  const input = node.data.template
    ? substituteVariables(node.data.template, variables)
    : String(variables.lastOutput ?? variables.input ?? "");
  const labels = (node.data.classifierLabels as string) || "positive,negative,neutral";
  const labelList = labels.split(",").map((l) => l.trim());

  // Use vLLM with zero-shot classification pipeline
  const vllmUrl = process.env.VLLM_URL || "http://vllm:8000";

  // Approach: use LLM to classify by asking it to pick from labels
  // This works with any chat model, not just classifiers
  const classifyPrompt = `Classify the following text into exactly one of these categories: ${labelList.join(", ")}.\n\nText: "${input}"\n\nRespond with only the category name, nothing else.`;

  const res = await fetchWithTimeout(
    `${vllmUrl}/v1/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: classifyPrompt }],
        temperature: 0,
        max_tokens: 50,
      }),
    },
    timeoutMs,
  );

  if (!res.ok) {
    // Fallback: try Ollama
    const ollamaUrl = process.env.OLLAMA_URL || "http://ollama:11434";
    const fallback = await fetchWithTimeout(
      `${ollamaUrl}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama3.2:1b",
          messages: [{ role: "user", content: classifyPrompt }],
          stream: false,
          options: { temperature: 0 },
        }),
      },
      timeoutMs,
    );
    if (!fallback.ok) throw new Error(`Classification failed: vLLM ${res.status}, Ollama ${fallback.status}`);
    const json = await fallback.json();
    const label = (json.message?.content ?? "").trim();
    variables.lastOutput = { label, labels: labelList, input };
    return variables.lastOutput;
  }

  const json = await res.json();
  const label = (json.choices?.[0]?.message?.content ?? "").trim();
  variables.lastOutput = { label, labels: labelList, input };
  return variables.lastOutput;
}
