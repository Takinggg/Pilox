// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import type { WorkflowNode } from "../types";

export function executeLoopNode(node: WorkflowNode, variables: Record<string, unknown>): unknown {
  const { loopVariable, maxIterations } = node.data;
  if (!loopVariable) throw new Error(`Loop node "${node.id}" has no loopVariable configured`);

  let items = variables[loopVariable];
  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch {
      items = [items];
    }
  }
  if (!Array.isArray(items)) {
    items = items ? [items] : [];
  }

  const max = maxIterations ?? 100;
  const limited = (items as unknown[]).slice(0, max);

  variables.lastOutput = limited;
  variables[`${loopVariable}_count`] = limited.length;
  return limited;
}

