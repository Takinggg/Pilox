// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { createModuleLogger } from "../../logger";
import { getOllamaBaseUrl } from "../../runtime-instance-config";
import { getModelInstance } from "../../model-instance-manager";
import { fetchWithTimeout, readErrorBodySnippet } from "../net";
import { substituteVariables } from "../graph";
import type { WorkflowNode } from "../types";
import { db } from "@/db";
import { computeUsageChargeMinor, getBillingUsageMinorPer1kTokens, applyInferenceUsageDebitInTx } from "../../billing/inference-usage-billing";

const log = createModuleLogger("workflow-executor");

export async function executeLlmNode(
  node: WorkflowNode,
  variables: Record<string, unknown>,
  timeoutMs: number
): Promise<unknown> {
  const { model, provider, template, systemPrompt, temperature, maxTokens } = node.data;
  if (!model) throw new Error(`LLM node "${node.id}" has no model configured`);

  const userContent = template
    ? substituteVariables(template, variables)
    : String(variables.lastOutput ?? variables.input ?? "");

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) messages.push({ role: "system", content: substituteVariables(systemPrompt, variables) });
  messages.push({ role: "user", content: userContent });

  // Route to appropriate provider — check for dedicated instance first
  const instanceId = node.data.instanceId as string | undefined;
  let resolvedProvider = provider ?? "ollama";
  let instanceUrl: string | null = null;

  // If a specific model instance is configured, resolve its IP:port
  if (instanceId) {
    try {
      const inst = await getModelInstance(instanceId);
      if (inst && inst.status === "running" && inst.instanceIp) {
        const port = inst.port ?? (inst.backend === "vllm" ? 8000 : 11434);
        instanceUrl = `http://${inst.instanceIp}:${port}`;
        resolvedProvider = inst.backend;
        log.info("workflow.llm.instance_route", { instanceId, url: instanceUrl, backend: inst.backend });
      }
    } catch (err) {
      log.warn("workflow.llm.instance_lookup_failed", { instanceId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (!instanceUrl && (resolvedProvider === "ollama" || resolvedProvider === "auto")) {
    // If the model looks like a HuggingFace ID (contains /), try vLLM first
    if (String(model).includes("/")) {
      try {
        const vllmUrl = process.env.VLLM_URL || "http://vllm:8000";
        const probe = await fetch(`${vllmUrl}/v1/models`, { signal: AbortSignal.timeout(2000) });
        if (probe.ok) resolvedProvider = "vllm";
      } catch { /* vLLM not available, fall back to ollama */ }
    }
  }
  let url: string;
  let body: Record<string, unknown>;
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (resolvedProvider === "ollama") {
    const base = instanceUrl ?? getOllamaBaseUrl();
    url = `${base}/api/chat`;
    body = {
      model,
      messages,
      stream: false,
      options: { temperature: temperature ?? 0.7, num_predict: maxTokens ?? 4096 },
    };
  } else if (resolvedProvider === "vllm" || resolvedProvider === "aphrodite") {
    const defaultBase = resolvedProvider === "aphrodite"
      ? "http://localhost:2242"
      : (process.env.VLLM_URL ?? "http://vllm:8000");
    const base = instanceUrl ?? defaultBase;
    url = `${base}/v1/chat/completions`;
    body = { model, messages, temperature: temperature ?? 0.7, max_tokens: maxTokens ?? 4096 };
  } else {
    // Cloud providers: OpenAI, Groq, Mistral, Anthropic
    const envKey = `${resolvedProvider.toUpperCase()}_API_KEY`;
    const apiKey = process.env[envKey];
    if (!apiKey) throw new Error(`Missing ${envKey} for LLM provider "${resolvedProvider}"`);

    const baseUrls: Record<string, string> = {
      openai: "https://api.openai.com/v1",
      groq: "https://api.groq.com/openai/v1",
      mistral: "https://api.mistral.ai/v1",
      anthropic: "https://api.anthropic.com/v1",
    };
    url = `${baseUrls[resolvedProvider] ?? baseUrls.openai}/chat/completions`;
    headers["Authorization"] = `Bearer ${apiKey}`;
    if (resolvedProvider === "anthropic") {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    }
    body = { model, messages, temperature: temperature ?? 0.7, max_tokens: maxTokens ?? 4096 };
  }

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    timeoutMs
  );

  if (!response.ok) {
    const text = await readErrorBodySnippet(response);
    throw new Error(`LLM "${model}" returned ${response.status}: ${text.slice(0, 200)}`);
  }

  const json = await response.json();
  const output = json.message?.content ?? json.choices?.[0]?.message?.content ?? JSON.stringify(json);
  variables.lastOutput = output;

  // Track token usage for billing
  const tokensIn = json.prompt_eval_count ?? json.usage?.prompt_tokens ?? 0;
  const tokensOut = json.eval_count ?? json.usage?.completion_tokens ?? 0;
  variables.__lastTokensIn = tokensIn;
  variables.__lastTokensOut = tokensOut;

  // Apply billing debit if usage metering is enabled
  const minorPer1k = getBillingUsageMinorPer1kTokens();
  if (minorPer1k > 0 && (tokensIn + tokensOut) > 0) {
    const chargeMinor = computeUsageChargeMinor(tokensIn, tokensOut, minorPer1k);
    const userId = String(variables.__userId ?? "");
    const agentId = String(variables.__agentId ?? "");
    if (userId && chargeMinor > 0) {
      try {
        await db.transaction(async (tx) => {
          await applyInferenceUsageDebitInTx(tx, {
            userId,
            inferenceUsageId: `llm-${node.id}-${Date.now()}`,
            agentId,
            tokensIn,
            tokensOut,
            model: String(model),
            chargeMinor,
          });
        });
      } catch (err) {
        log.warn("billing.usage_debit_failed", { nodeId: node.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  return output;
}

