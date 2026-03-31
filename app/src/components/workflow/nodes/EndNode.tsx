"use client";

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * End node — terminal node in the workflow graph.
 * Adapted from thutasann/workflow-builder ApGraphEndNode (MIT).
 */

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CircleStop } from "lucide-react";
import { HANDLE_STYLING } from "../constants";

export const EndNode = memo(function EndNode({ data }: NodeProps) {
  const showWidget = (data as { showWidget?: boolean }).showWidget ?? true;

  if (!showWidget) {
    return (
      <div className="h-px w-px relative">
        <Handle type="target" position={Position.Top} style={HANDLE_STYLING} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted text-muted-foreground rounded-full text-xs font-medium select-none">
      <CircleStop className="h-3 w-3" />
      End
      <Handle type="target" position={Position.Top} style={HANDLE_STYLING} />
    </div>
  );
});
