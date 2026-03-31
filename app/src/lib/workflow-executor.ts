// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Workflow executor — public entrypoint.
 *
 * Implementation lives under `src/lib/workflow/*` to keep modules smaller.
 */

export { executeWorkflow } from "./workflow/execute";
export type {
  StepResult,
  WorkflowEdge,
  WorkflowExecutionResult,
  WorkflowGraph,
  WorkflowNode,
} from "./workflow/types";

