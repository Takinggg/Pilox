"use client";

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Router node — conditional branching with multiple source handles.
 * Adapted from thutasann/workflow-builder ApRouterNode (MIT).
 */

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch, Trash2 } from "lucide-react";
import { useWorkflow } from "../WorkflowContext";
import { HANDLE_STYLING, NODE_SIZE } from "../constants";

interface RouterData {
  label?: string;
  stepType?: string;
  condition?: string;
  conditions?: Array<{ field: string; operator: string; value: string }>;
  [key: string]: unknown;
}

export const RouterNode = memo(function RouterNode({
  id,
  data,
  selected,
}: NodeProps) {
  const { deleteNode, selectedNodeId } = useWorkflow();
  const nodeData = data as unknown as RouterData;
  const isSelected = selected || selectedNodeId === id;

  const conditionCount = nodeData.conditions?.length ?? (nodeData.condition ? 1 : 0);

  return (
    <div
      style={{ width: NODE_SIZE.step.width }}
      className={`rounded-lg border-2 bg-card px-4 py-3 shadow-sm ${
        isSelected ? "border-amber-500 ring-2 ring-amber-500/20" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} style={HANDLE_STYLING} />

      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-500/10">
          <GitBranch className="h-4 w-4 text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{nodeData.label || "Router"}</div>
          <div className="text-xs text-muted-foreground">
            {conditionCount > 0
              ? `${conditionCount} condition(s)`
              : "Conditional branching"}
          </div>
        </div>

        {isSelected && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteNode(id);
            }}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Dynamic branch outputs based on conditions array, or fallback to true/false */}
      {(nodeData.conditions?.length ?? 0) > 0 ? (
        <>
          {nodeData.conditions!.map((cond, i) => (
            <Handle
              key={`cond-${i}`}
              type="source"
              position={Position.Bottom}
              id={`cond-${i}`}
              className="!bg-amber-500 !w-3 !h-3"
              style={{ left: `${((i + 1) / (nodeData.conditions!.length + 2)) * 100}%` }}
              title={`${cond.field} ${cond.operator} ${cond.value}`}
            />
          ))}
          <Handle
            type="source"
            position={Position.Bottom}
            id="default"
            className="!bg-zinc-500 !w-3 !h-3"
            style={{ left: `${((nodeData.conditions!.length + 1) / (nodeData.conditions!.length + 2)) * 100}%` }}
            title="default"
          />
        </>
      ) : (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            className="!bg-green-500 !w-3 !h-3"
            style={{ left: "30%" }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className="!bg-red-500 !w-3 !h-3"
            style={{ left: "70%" }}
          />
        </>
      )}
    </div>
  );
});
