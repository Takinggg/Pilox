// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Env-only policy for workflow JavaScript code nodes (no DB).
 * @see resolveWorkflowCodeNodeDisabled in instance-security-policy.ts for UI overrides.
 */
export function isPiloxWorkflowCodeNodeDisabledByEnv(): boolean {
  const v = process.env.PILOX_WORKFLOW_DISABLE_CODE_NODE?.trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return process.env.NODE_ENV === "production";
}
