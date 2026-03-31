// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { createModuleLogger } from "../../logger";
import { fetchWithTimeout, readErrorBodySnippet } from "../net";
import { substituteVariables } from "../graph";
import type { WorkflowNode } from "../types";

const log = createModuleLogger("workflow-executor");

export async function executeAgentNode(
  node: WorkflowNode,
  variables: Record<string, unknown>,
  timeoutMs: number
): Promise<unknown> {
  const { agentId, template } = node.data;
  if (!agentId) throw new Error(`Agent node "${node.id}" has no agentId`);

  const [agent] = await db
    .select({
      id: agents.id,
      instanceIp: agents.instanceIp,
      port: agents.port,
      status: agents.status,
    })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent) throw new Error(`Agent "${agentId}" not found`);
  if (agent.status !== "running") throw new Error(`Agent "${agentId}" is ${agent.status}`);

  const prompt = template
    ? substituteVariables(template, variables)
    : String(variables.lastOutput ?? variables.input ?? "");

  const url = `http://${agent.instanceIp}:${agent.port}/api/chat`;

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt }),
    },
    timeoutMs
  );

  if (!response.ok) {
    const text = await readErrorBodySnippet(response);
    throw new Error(`Agent "${agentId}" returned ${response.status}: ${text.slice(0, 200)}`);
  }

  const json = await response.json();
  const output = json.message?.content ?? JSON.stringify(json);
  variables.lastOutput = output;
  return output;
}

