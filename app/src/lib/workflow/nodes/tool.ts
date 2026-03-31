// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { createModuleLogger } from "../../logger";
import { assertUrlSafeForEgressFetch } from "../../egress-ssrf-guard";
import { substituteVariables } from "../graph";
import type { WorkflowNode } from "../types";

const log = createModuleLogger("workflow-executor");

export async function executeToolNode(node: WorkflowNode, variables: Record<string, unknown>): Promise<unknown> {
  const { toolName, mcpServer, toolParams } = node.data;
  if (!toolName) throw new Error(`Tool node "${node.id}" has no toolName configured`);

  let params: Record<string, unknown> = {};
  if (toolParams) {
    const substituted = substituteVariables(toolParams, variables);
    try {
      params = JSON.parse(substituted);
    } catch {
      params = { raw: substituted };
    }
  }

  log.info("workflow_executor.tool_call", { nodeId: node.id, mcpServer, toolName, params });

  // Look up MCP server URL from agent config or environment
  let serverUrl = mcpServer;
  if (serverUrl && !serverUrl.startsWith("http")) {
    // Resolve server name → URL from env (MCP_SERVER_<NAME>_URL)
    const envKey = `MCP_SERVER_${serverUrl.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_URL`;
    serverUrl = process.env[envKey] ?? undefined;
  }

  if (serverUrl) {
    // Call MCP server via JSON-RPC 2.0 (standard MCP protocol)
    const gate = await assertUrlSafeForEgressFetch(serverUrl);
    if (!gate.ok) {
      throw new Error(`MCP server URL blocked by egress policy: ${gate.reason}`);
    }

    try {
      const rpcResponse = await fetch(gate.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `wf-${node.id}-${Date.now()}`,
          method: "tools/call",
          params: { name: toolName, arguments: params },
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!rpcResponse.ok) {
        const text = await rpcResponse.text().catch((err) => {
          log.warn("Failed to read MCP RPC error body", { err });
          return "";
        });
        throw new Error(`MCP server returned ${rpcResponse.status}: ${text.slice(0, 200)}`);
      }

      const rpcJson = await rpcResponse.json();
      if (rpcJson.error) {
        throw new Error(`MCP tool error: ${rpcJson.error.message ?? JSON.stringify(rpcJson.error)}`);
      }

      const output = rpcJson.result?.content ?? rpcJson.result ?? rpcJson;
      variables.lastOutput = output;
      return output;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("MCP")) throw err;
      throw new Error(`MCP tool call failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // No server URL configured: return placeholder
  const output = { toolName, params, note: "No MCP server configured" };
  variables.lastOutput = output;
  return output;
}

