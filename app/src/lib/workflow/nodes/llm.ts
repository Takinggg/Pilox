// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { createModuleLogger } from "../../logger";
import { getOllamaBaseUrl } from "../../runtime-instance-config";
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

  // Route to appropriate provider
  const resolvedProvider = provider ?? "ollama";
  let url: string;
  let body: Record<string, unknown>;
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (resolvedProvider === "ollama") {
    url = `${getOllamaBaseUrl()}/api/chat`;
    body = {
      model,
      messages,
      stream: false,
      options: { temperature: temperature ?? 0.7, num_predict: maxTokens ?? 4096 },
    };
  } else {
    // OpenAI-compatible (openai, groq, mistral, anthropic)
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

