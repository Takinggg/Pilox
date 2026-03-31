// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { createModuleLogger } from "../logger";
import { findStartNode, resolveNextNode } from "./graph";
import { updateRunStatus } from "./run-store";
import type { StepResult, WorkflowExecutionResult, WorkflowGraph, WorkflowNode } from "./types";
import { executeAgentNode } from "./nodes/agent";
import { executeCodeNode } from "./nodes/code";
import { executeHttpNode } from "./nodes/http";
import { executeLlmNode } from "./nodes/llm";
import { executeLoopNode } from "./nodes/loop";
import { executeMemoryNode } from "./nodes/memory";
import { executeRagNode } from "./nodes/rag";
import { executeToolNode } from "./nodes/tool";
import { executeTransformNode } from "./nodes/transform";

const log = createModuleLogger("workflow-executor");

const MAX_STEPS = 100;

/**
 * Execute a workflow graph with given input variables.
 * Updates the workflow_runs row with status and output on completion.
 */
export async function executeWorkflow(
  runId: string,
  graph: WorkflowGraph,
  input: Record<string, unknown>
): Promise<WorkflowExecutionResult> {
  const variables: Record<string, unknown> = { ...input };
  const steps: StepResult[] = [];

  try {
    // Validate graph
    if (!graph.nodes?.length) {
      throw new Error("Workflow graph has no nodes");
    }

    // Find start node
    const startNode = findStartNode(graph);
    if (!startNode) {
      throw new Error("No start node found in workflow graph");
    }

    // Execute graph traversal
    let currentNodeId: string | null = startNode.id;
    let stepCount = 0;

    while (currentNodeId && stepCount < MAX_STEPS) {
      stepCount++;
      const node = graph.nodes.find((n) => n.id === currentNodeId);
      if (!node) {
        throw new Error(`Node "${currentNodeId}" not found in graph`);
      }

      // End node — stop execution
      if (node.type === "end") {
        steps.push({
          nodeId: node.id,
          nodeType: "end",
          status: "success",
          durationMs: 0,
        });
        break;
      }

      // Execute node with retry support
      const maxRetries = node.data.maxRetries ?? 0;
      let stepResult: StepResult | null = null;
      let skipResolveNext = false;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const start = Date.now();
        try {
          const output = await executeNode(node, variables);
          stepResult = {
            nodeId: node.id,
            nodeType: node.type,
            status: "success",
            output,
            durationMs: Date.now() - start,
          };

          // Store output in variables
          if (output !== undefined) {
            variables[`step_${node.id}`] = output;
            if (node.data.outputVariable) {
              variables[node.data.outputVariable] = output;
            }
          }

          // Loop iteration: if this is a loop node, execute downstream subgraph per item
          if (node.type === "loop" && Array.isArray(output)) {
            const loopResults: unknown[] = [];
            const nextNodeId = resolveNextNode(graph, node, { ...variables });
            if (nextNodeId) {
              for (let i = 0; i < (output as unknown[]).length; i++) {
                variables.__loopItem = (output as unknown[])[i];
                variables.__loopIndex = i;
                // Execute the downstream node for this item
                const downstreamNode = graph.nodes.find((n) => n.id === nextNodeId);
                if (downstreamNode && downstreamNode.type !== "end") {
                  const itemOutput = await executeNode(downstreamNode, variables);
                  loopResults.push(itemOutput);
                  if (itemOutput !== undefined) {
                    variables[`step_${downstreamNode.id}`] = itemOutput;
                    if (downstreamNode.data.outputVariable) {
                      variables[downstreamNode.data.outputVariable] = itemOutput;
                    }
                  }
                  steps.push({
                    nodeId: downstreamNode.id,
                    nodeType: downstreamNode.type,
                    status: "success",
                    output: itemOutput,
                    durationMs: 0,
                  });
                }
              }
              variables.__loopResults = loopResults;
              variables.lastOutput = loopResults;
              delete variables.__loopItem;
              delete variables.__loopIndex;
              // Skip past the downstream node since we already executed it
              currentNodeId = resolveNextNode(graph, graph.nodes.find((n) => n.id === nextNodeId)!, variables);
              skipResolveNext = true;
            }
          }

          break; // Success, no retry
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          stepResult = {
            nodeId: node.id,
            nodeType: node.type,
            status: "failed",
            error: errMsg,
            durationMs: Date.now() - start,
          };

          if (attempt < maxRetries) {
            log.warn("workflow_executor.step_retry", {
              runId,
              nodeId: node.id,
              attempt: attempt + 1,
              maxRetries,
              error: errMsg,
            });
            // Exponential backoff: 1s, 2s, 4s...
            await sleep(Math.min(1000 * Math.pow(2, attempt), 10_000));
          }
        }
      }

      if (stepResult) steps.push(stepResult);

      // If the step failed after all retries, stop execution
      if (stepResult?.status === "failed") {
        const result: WorkflowExecutionResult = {
          status: "failed",
          output: variables,
          steps,
          error: `Step "${node.id}" failed: ${stepResult.error}`,
        };
        await updateRunStatus(runId, "failed", result);
        return result;
      }

      // Find next node via edges (skip if loop already set it)
      if (!skipResolveNext) {
        currentNodeId = resolveNextNode(graph, node, variables);
      }
    }

    if (stepCount >= MAX_STEPS) {
      const result: WorkflowExecutionResult = {
        status: "failed",
        output: variables,
        steps,
        error: `Max steps (${MAX_STEPS}) exceeded — possible infinite loop`,
      };
      await updateRunStatus(runId, "failed", result);
      return result;
    }

    const result: WorkflowExecutionResult = {
      status: "completed",
      output: variables,
      steps,
    };
    await updateRunStatus(runId, "completed", result);
    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("workflow_executor.execution_failed", { runId, error: errMsg });

    const result: WorkflowExecutionResult = {
      status: "failed",
      output: variables,
      steps,
      error: errMsg,
    };
    await updateRunStatus(runId, "failed", result);
    return result;
  }
}

// ── Node Execution ───────────────────────────────────

async function executeNode(node: WorkflowNode, variables: Record<string, unknown>): Promise<unknown> {
  const timeoutMs = (node.data.timeoutSeconds ?? 120) * 1000;

  switch (node.type) {
    case "start":
      return variables;

    case "agent":
      return executeAgentNode(node, variables, timeoutMs);

    case "transform":
    case "prompt":
      return executeTransformNode(node, variables);

    case "router":
      // Router nodes just return the variables; routing is done in resolveNextNode
      return variables;

    case "llm":
      return executeLlmNode(node, variables, timeoutMs);

    case "rag":
      return executeRagNode(node, variables);

    case "tool":
      return executeToolNode(node, variables);

    case "memory":
      return executeMemoryNode(node, variables);

    case "http":
      return executeHttpNode(node, variables, timeoutMs);

    case "code":
      return executeCodeNode(node, variables);

    case "loop":
      // Loop node returns the array to iterate; actual iteration done by graph traversal
      return executeLoopNode(node, variables);

    default:
      throw new Error(`Unknown node type: ${node.type}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

