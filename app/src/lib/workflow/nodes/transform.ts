// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { substituteVariables } from "../graph";
import type { WorkflowNode } from "../types";

export function executeTransformNode(node: WorkflowNode, variables: Record<string, unknown>): unknown {
  const { template, action } = node.data;
  const input = variables.lastOutput;

  if (template) {
    const output = substituteVariables(template, variables);
    variables.lastOutput = output;
    return output;
  }

  switch (action) {
    case "passthrough":
    default:
      return input;
  }
}

