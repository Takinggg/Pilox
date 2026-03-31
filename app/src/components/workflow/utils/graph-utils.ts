// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Graph manipulation utilities — offset, merge, bounding box.
 * Adapted from thutasann/workflow-builder graphUtils (MIT).
 */

import type { Node, Edge } from "@xyflow/react";
import {
  NODE_SIZE,
  VERTICAL_SPACE_BETWEEN_STEPS,
  doesNodeAffectBoundingBox,
} from "../constants";
import type { BoundingBox } from "../types";

/** Offset all node positions by (dx, dy). */
export function offsetNodes(nodes: Node[], dx: number, dy: number): Node[] {
  return nodes.map((n) => ({
    ...n,
    position: { x: n.position.x + dx, y: n.position.y + dy },
  }));
}

/** Merge two sets of nodes and edges. */
export function mergeGraphs(
  a: { nodes: Node[]; edges: Edge[] },
  b: { nodes: Node[]; edges: Edge[] },
): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: [...a.nodes, ...b.nodes],
    edges: [...a.edges, ...b.edges],
  };
}

/** Compute bounding box for a set of nodes. */
export function calculateBoundingBox(nodes: Node[]): BoundingBox {
  const relevant = nodes.filter((n) => doesNodeAffectBoundingBox(n.type ?? ""));

  if (relevant.length === 0) {
    return { width: 0, height: 0, left: 0, right: 0, top: 0, bottom: 0 };
  }

  const minX = Math.min(...relevant.map((n) => n.position.x));
  const minY = Math.min(...nodes.map((n) => n.position.y));
  const maxX = Math.max(...relevant.map((n) => n.position.x + NODE_SIZE.step.width));
  const maxY = Math.max(...nodes.map((n) => n.position.y));

  return {
    width: maxX - minX,
    height: maxY - minY,
    left: -minX + NODE_SIZE.step.width / 2,
    right: maxX - NODE_SIZE.step.width / 2,
    top: minY,
    bottom: maxY,
  };
}

/**
 * Build an initial linear graph from a simple node list.
 * Creates start → step1 → step2 → ... → end with proper vertical spacing.
 */
export function buildLinearGraph(
  steps: Array<{ id: string; type: string; data: Record<string, unknown> }>,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const centerX = 0;

  steps.forEach((step, i) => {
    nodes.push({
      id: step.id,
      type: step.type,
      position: { x: centerX, y: i * (NODE_SIZE.step.height + VERTICAL_SPACE_BETWEEN_STEPS) },
      data: step.data,
    });

    if (i > 0) {
      edges.push({
        id: `${steps[i - 1].id}-${step.id}`,
        source: steps[i - 1].id,
        target: step.id,
        type: "straightLine",
      });
    }
  });

  return { nodes, edges };
}
