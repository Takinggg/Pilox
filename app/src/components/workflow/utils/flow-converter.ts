// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Bidirectional converter between:
 * - Pilox workflow-executor graph format (persisted in DB)
 * - React Flow nodes/edges (canvas display)
 *
 * Adapted from thutasann/workflow-builder reactFlowConverter (MIT).
 */

import type { Node, Edge } from "@xyflow/react";
import type { WorkflowGraph, WorkflowNode, WorkflowEdge } from "@/lib/workflow-executor";
import {
  NODE_SIZE,
  VERTICAL_SPACE_BETWEEN_STEPS,
} from "../constants";
import { WfNodeType, WfEdgeType } from "../types";

/**
 * Convert a persisted WorkflowGraph into React Flow nodes & edges
 * for the canvas. Adds layout positioning via BFS.
 */
export function graphToReactFlow(graph: WorkflowGraph): { nodes: Node[]; edges: Edge[] } {
  if (!graph?.nodes?.length) return { nodes: [], edges: [] };

  // Build adjacency info
  const inboundCount = new Map<string, number>();
  const outbound = new Map<string, string[]>();
  for (const edge of graph.edges) {
    inboundCount.set(edge.target, (inboundCount.get(edge.target) ?? 0) + 1);
    const outs = outbound.get(edge.source) ?? [];
    outs.push(edge.target);
    outbound.set(edge.source, outs);
  }

  // Find start node
  const startId = graph.nodes.find((n) => n.type === "start")?.id
    ?? graph.nodes.find((n) => !inboundCount.has(n.id))?.id
    ?? graph.nodes[0].id;

  // Auto-layout via BFS with lane-collision avoidance
  const positions = new Map<string, { x: number; y: number }>();
  const usedLanes = new Map<number, Set<number>>(); // depth → set of used lanes
  const queue: Array<{ id: string; depth: number; lane: number }> = [{ id: startId, depth: 0, lane: 0 }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { id, depth, lane } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    if (!usedLanes.has(depth)) usedLanes.set(depth, new Set());
    let finalLane = lane;
    const depthLanes = usedLanes.get(depth)!;
    while (depthLanes.has(finalLane)) finalLane++;
    depthLanes.add(finalLane);

    positions.set(id, {
      x: finalLane * (NODE_SIZE.step.width + 60),
      y: depth * (NODE_SIZE.step.height + VERTICAL_SPACE_BETWEEN_STEPS),
    });

    const children = outbound.get(id) ?? [];
    const laneOffset = children.length > 1 ? -(children.length - 1) / 2 : 0;
    children.forEach((childId, i) => {
      if (!visited.has(childId)) {
        queue.push({ id: childId, depth: depth + 1, lane: finalLane + laneOffset + i });
      }
    });
  }

  // Position unvisited/disconnected nodes
  let nextY = (visited.size + 1) * (NODE_SIZE.step.height + VERTICAL_SPACE_BETWEEN_STEPS);
  for (const node of graph.nodes) {
    if (!positions.has(node.id)) {
      positions.set(node.id, { x: 0, y: nextY });
      nextY += NODE_SIZE.step.height + VERTICAL_SPACE_BETWEEN_STEPS;
    }
  }

  // Map executor node type → React Flow node type
  const nodeTypeMap: Record<string, string> = {
    start: WfNodeType.STEP,
    end: WfNodeType.END_WIDGET,
    agent: WfNodeType.STEP,
    router: WfNodeType.ROUTER,
    transform: WfNodeType.STEP,
    llm: WfNodeType.STEP,
    prompt: WfNodeType.STEP,
    rag: WfNodeType.STEP,
    tool: WfNodeType.STEP,
    memory: WfNodeType.STEP,
    http: WfNodeType.STEP,
    code: WfNodeType.STEP,
    loop: WfNodeType.STEP,
  };

  const nodes: Node[] = graph.nodes.map((n) => ({
    id: n.id,
    type: nodeTypeMap[n.type] ?? WfNodeType.STEP,
    position: positions.get(n.id) ?? { x: 0, y: 0 },
    data: {
      stepType: n.type,
      label: n.data.label ?? n.type.charAt(0).toUpperCase() + n.type.slice(1),
      // Spread all data fields so new node types preserve their config
      ...n.data,
    },
    selectable: n.type !== "end",
    draggable: true,
  }));

  // Map to React Flow edges
  const edges: Edge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
    type: WfEdgeType.STRAIGHT_LINE,
    data: {
      parentStepId: e.source,
      condition: e.data?.condition,
      variableMap: e.data?.variableMap,
    },
  }));

  return { nodes, edges };
}

/**
 * Convert React Flow nodes & edges back to the persisted WorkflowGraph format
 * for the workflow executor.
 */
export function reactFlowToGraph(
  nodes: Node[],
  edges: Edge[],
): WorkflowGraph {
  const workflowNodes: WorkflowNode[] = nodes
    .filter((n) => n.type !== WfNodeType.ADD_BUTTON) // strip canvas-only nodes
    .map((n) => {
      // Determine the executor type from stepType data or node type
      let nodeType: WorkflowNode["type"] = (n.data?.stepType as WorkflowNode["type"]) ?? "agent";
      // EndWidget nodes must always serialize as "end"
      if (n.type === WfNodeType.END_WIDGET) nodeType = "end";
      // Router nodes must always serialize as "router"
      if (n.type === WfNodeType.ROUTER) nodeType = "router";

      // Spread all data fields from React Flow node, stripping stepType (already in type)
      const { stepType: _st, ...dataFields } = (n.data ?? {}) as Record<string, unknown>;
      return {
        id: n.id,
        type: nodeType,
        data: dataFields as WorkflowNode["data"],
      };
    });

  const workflowEdges: WorkflowEdge[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
    data: {
      condition: e.data?.condition as string | undefined,
      variableMap: e.data?.variableMap as Record<string, string> | undefined,
    },
  }));

  return { nodes: workflowNodes, edges: workflowEdges };
}
