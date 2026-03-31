// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { resolveWorkflowCodeNodeDisabled } from "../../instance-security-policy";
import { executeInSandbox, validateCode } from "../../workflow-sandbox";
import type { WorkflowNode } from "../types";

export async function executeCodeNode(node: WorkflowNode, variables: Record<string, unknown>): Promise<unknown> {
  const { codeContent, language, timeoutSeconds } = node.data;
  if (!codeContent) throw new Error(`Code node "${node.id}" has no code`);

  if (language === "python") {
    throw new Error("Python code execution not yet implemented — use JavaScript");
  }

  if (await resolveWorkflowCodeNodeDisabled()) {
    throw new Error(
      "JavaScript code node is disabled (env or Settings > Security). Remove the node, set PILOX_WORKFLOW_DISABLE_CODE_NODE=false, or set workflow code nodes to 'allow' in Security settings if appropriate."
    );
  }

  const validation = validateCode(codeContent);
  if (!validation.valid) {
    throw new Error(`Code validation failed: ${validation.error}`);
  }

  const timeout = (timeoutSeconds ?? 5) * 1000;
  const sandboxResult = await executeInSandbox(codeContent, variables, { timeout });

  if (sandboxResult.error) {
    throw new Error(`Sandbox error: ${sandboxResult.error}`);
  }

  variables.lastOutput = sandboxResult.result;
  return sandboxResult.result;
}

