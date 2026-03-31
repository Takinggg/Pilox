"use client";

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Big "+" add button — placeholder node for inserting new steps.
 * Adapted from thutasann/workflow-builder ApBigAddButtonNode (MIT).
 */

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Plus } from "lucide-react";
import { useWorkflow } from "../WorkflowContext";
import { NODE_SIZE, HANDLE_STYLING } from "../constants";
import type { AddButtonData } from "../types";

export const AddButtonNode = memo(function AddButtonNode({
  data,
  positionAbsoluteX,
  positionAbsoluteY,
}: NodeProps) {
  const { openStepSelector } = useWorkflow();
  const btnData = data as unknown as AddButtonData;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openStepSelector(
      btnData.parentStepId,
      {
        x: positionAbsoluteX + NODE_SIZE.addButton.width / 2,
        y: positionAbsoluteY + NODE_SIZE.addButton.height / 2,
      },
      btnData.branchIndex,
    );
  };

  return (
    <div
      style={{ width: NODE_SIZE.addButton.width, height: NODE_SIZE.addButton.height }}
      className="group relative"
    >
      <button
        onClick={handleClick}
        className="w-full h-full bg-background border-2 border-dashed border-muted-foreground/30 rounded-lg flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-all shadow-sm group-hover:shadow-md"
      >
        <Plus className="h-5 w-5" />
      </button>
      <Handle type="target" position={Position.Top} style={HANDLE_STYLING} />
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLING} />
    </div>
  );
});
