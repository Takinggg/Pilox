// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Layout constants for the workflow canvas.
 * Adapted from thutasann/workflow-builder flowConstants (MIT).
 */

import { WfNodeType } from "./types";

export const ARC_LENGTH = 15;

// SVG arc path segments
export const ARC_LEFT = `a${ARC_LENGTH},${ARC_LENGTH} 0 0,0 -${ARC_LENGTH},${ARC_LENGTH}`;
export const ARC_RIGHT = `a${ARC_LENGTH},${ARC_LENGTH} 0 0,1 ${ARC_LENGTH},${ARC_LENGTH}`;
export const ARROW_DOWN = "m6 -6 l-6 6 m-6 -6 l6 6";

// Spacing
export const VERTICAL_SPACE_BETWEEN_STEP_AND_LINE = 7;
export const VERTICAL_SPACE_BETWEEN_STEPS = 85;
export const VERTICAL_OFFSET_BETWEEN_ROUTER_AND_CHILD = VERTICAL_SPACE_BETWEEN_STEPS * 1.5 + 2 * ARC_LENGTH + 30;
export const LINE_WIDTH = 1.5;
export const HORIZONTAL_SPACE_BETWEEN_NODES = 120;

// Node sizes
export const NODE_SIZE = {
  step: { width: 260, height: 70 },
  addButton: { width: 50, height: 50 },
  inlineAddButton: { width: 18, height: 18 },
};

// Visible connection handles — small dots that grow on hover
export const HANDLE_STYLING = {
  width: 8,
  height: 8,
  background: "var(--pilox-fg-muted)",
  border: "2px solid var(--pilox-bg)",
  cursor: "crosshair",
  transition: "all 150ms ease",
} as const;

/** Nodes that affect bounding-box calculations. */
export function doesNodeAffectBoundingBox(type: string): boolean {
  return type === WfNodeType.ADD_BUTTON || type === WfNodeType.STEP;
}
