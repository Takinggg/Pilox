// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/** Caps workflow sandbox timer delay: [0, min(sandboxTimeoutMs, 60s)]. Exported for unit tests. */
export function capWorkflowTimerDelay(requestedMs: unknown, sandboxTimeoutMs: number): number {
  const maxTimerMs = Math.min(sandboxTimeoutMs, 60_000);
  const raw = typeof requestedMs === "number" && Number.isFinite(requestedMs) ? requestedMs : 0;
  return Math.min(Math.max(0, raw), maxTimerMs);
}

