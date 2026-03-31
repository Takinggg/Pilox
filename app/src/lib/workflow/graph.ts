// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import type { WorkflowGraph, WorkflowNode } from "./types";

export function findStartNode(graph: WorkflowGraph): WorkflowNode | undefined {
  // Explicit start node
  const startNode = graph.nodes.find((n) => n.type === "start");
  if (startNode) return startNode;

  // Otherwise: first node with no inbound edges
  const targetIds = new Set(graph.edges.map((e) => e.target));
  return graph.nodes.find((n) => !targetIds.has(n.id));
}

export function resolveNextNode(
  graph: WorkflowGraph,
  currentNode: WorkflowNode,
  variables: Record<string, unknown>
): string | null {
  const outEdges = graph.edges.filter((e) => e.source === currentNode.id);
  if (outEdges.length === 0) return null;

  // Apply variable mapping on each edge
  for (const edge of outEdges) {
    if (edge.data?.variableMap) {
      for (const [targetVar, sourceVar] of Object.entries(edge.data.variableMap)) {
        variables[targetVar] = variables[sourceVar];
      }
    }
  }

  // For router nodes, evaluate conditions on edges (multi-branch)
  if (currentNode.type === "router") {
    // Multi-branch: each edge has its own condition
    const conditionEdges = outEdges.filter((e) => e.data?.condition && e.data.condition !== "default");
    for (const edge of conditionEdges) {
      if (evaluateCondition(edge.data!.condition!, variables) === true) {
        return edge.target;
      }
    }

    // Legacy single-condition mode: node.data.condition + true/false handles
    const condition = currentNode.data.condition;
    if (condition) {
      const result = evaluateCondition(condition, variables);
      const matchedEdge = outEdges.find(
        (e) => e.data?.condition === String(result) || e.sourceHandle === String(result)
      );
      if (matchedEdge) return matchedEdge.target;
    }

    // Fall back to "default" edge
    const defaultEdge = outEdges.find(
      (e) => e.data?.condition === "default" || e.sourceHandle === "default"
    );
    if (defaultEdge) return defaultEdge.target;
  }

  // Non-router nodes or no condition: follow the first edge
  return outEdges[0].target;
}

/**
 * Safe condition evaluator. Supports:
 * - Comparisons: "status == 'ok'", "count > 10", "count >= 5", "count <= 100"
 * - String ops: "name.contains('foo')", "name.startsWith('bar')", "name.endsWith('baz')"
 * - Logic: "status == 'ok' && count > 5", "a || b"
 * - Truthiness: "hasData"
 * Does NOT use eval() for security.
 */
export function evaluateCondition(
  condition: string,
  variables: Record<string, unknown>
): boolean | string {
  const trimmed = condition.trim();

  // AND: "expr1 && expr2"
  if (trimmed.includes("&&")) {
    return trimmed.split("&&").every((part) => evaluateCondition(part.trim(), variables) === true);
  }

  // OR: "expr1 || expr2"
  if (trimmed.includes("||")) {
    return trimmed.split("||").some((part) => evaluateCondition(part.trim(), variables) === true);
  }

  // String methods: varName.contains('value'), varName.startsWith('value'), varName.endsWith('value')
  const strMethodMatch = trimmed.match(/^(\w+)\.(contains|startsWith|endsWith)\(['"](.+)['"]\)$/);
  if (strMethodMatch) {
    const val = String(variables[strMethodMatch[1]] ?? "");
    const method = strMethodMatch[2];
    const arg = strMethodMatch[3];
    if (method === "contains") return val.includes(arg);
    if (method === "startsWith") return val.startsWith(arg);
    if (method === "endsWith") return val.endsWith(arg);
  }

  // Equality: varName == 'value' or varName === 'value'
  const eqMatch = trimmed.match(/^(\w+)\s*={2,3}\s*['"](.+)['"]$/);
  if (eqMatch) {
    return String(variables[eqMatch[1]] ?? "") === eqMatch[2];
  }

  // Inequality: varName != 'value' or varName !== 'value'
  const neqMatch = trimmed.match(/^(\w+)\s*!={1,2}\s*['"](.+)['"]$/);
  if (neqMatch) {
    return String(variables[neqMatch[1]] ?? "") !== neqMatch[2];
  }

  // Numeric: >=, <=, >, <
  const numMatch = trimmed.match(/^(\w+)\s*(>=|<=|>|<)\s*(\d+(?:\.\d+)?)$/);
  if (numMatch) {
    const val = Number(variables[numMatch[1]] ?? 0);
    const num = Number(numMatch[3]);
    switch (numMatch[2]) {
      case ">": return val > num;
      case "<": return val < num;
      case ">=": return val >= num;
      case "<=": return val <= num;
    }
  }

  // Truthiness: just a variable name
  if (/^\w+$/.test(trimmed)) {
    return Boolean(variables[trimmed]);
  }

  // Default: return as-is (string label for edge matching)
  return trimmed;
}

/** Replace {{varName}} placeholders in a template string. */
export function substituteVariables(
  template: string,
  variables: Record<string, unknown>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = variables[key];
    if (val === undefined || val === null) return "";
    return typeof val === "string" ? val : JSON.stringify(val);
  });
}

