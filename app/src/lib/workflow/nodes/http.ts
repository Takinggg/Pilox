// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { assertUrlSafeForEgressFetch } from "../../egress-ssrf-guard";
import { fetchWithTimeout } from "../net";
import { substituteVariables } from "../graph";
import type { WorkflowNode } from "../types";

export async function executeHttpNode(
  node: WorkflowNode,
  variables: Record<string, unknown>,
  timeoutMs: number
): Promise<unknown> {
  const { url, method, headers: headersStr, body: bodyStr } = node.data;
  if (!url) throw new Error(`HTTP node "${node.id}" has no URL configured`);

  const resolvedUrl = substituteVariables(url, variables);
  const resolvedMethod = method ?? "GET";

  const gate = await assertUrlSafeForEgressFetch(resolvedUrl);
  if (!gate.ok) {
    throw new Error(
      `HTTP node URL blocked by egress policy (${gate.reason}). Add hosts under Settings → Security or set PILOX_EGRESS_FETCH_HOST_ALLOWLIST.`
    );
  }

  let parsedHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (headersStr) {
    try {
      parsedHeaders = { ...parsedHeaders, ...JSON.parse(substituteVariables(headersStr, variables)) };
    } catch {
      /* keep defaults */
    }
  }

  const fetchOpts: RequestInit = {
    method: resolvedMethod,
    headers: parsedHeaders,
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "error",
  };
  if (bodyStr && !["GET", "HEAD"].includes(resolvedMethod)) {
    fetchOpts.body = substituteVariables(bodyStr, variables);
  }

  const response = await fetchWithTimeout(gate.url, fetchOpts, timeoutMs);
  const contentType = response.headers.get("content-type") ?? "";
  let output: unknown;

  if (contentType.includes("application/json")) {
    output = await response.json();
  } else {
    output = await response.text();
  }

  if (!response.ok) {
    throw new Error(`HTTP ${resolvedMethod} ${resolvedUrl} returned ${response.status}`);
  }

  variables.lastOutput = output;
  return output;
}

