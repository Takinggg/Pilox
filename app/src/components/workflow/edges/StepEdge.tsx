"use client";

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Straight-line edge with an inline "+" button for inserting steps.
 * Adapted from thutasann/workflow-builder ApStraightLineEdge (MIT).
 */

import { memo } from "react";
import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import { useWorkflow } from "../WorkflowContext";
import {
  LINE_WIDTH,
} from "../constants";

interface StepEdgeData {
  parentStepId?: string;
  drawArrowHead?: boolean;
  hideAddButton?: boolean;
  condition?: string;
  [key: string]: unknown;
}

export const StepEdge = memo(function StepEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const { openStepSelector } = useWorkflow();
  const edgeData = (data ?? {}) as StepEdgeData;

  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  });

  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;
  const edgeLength = Math.abs(targetY - sourceY) + Math.abs(targetX - sourceX);

  const handleAddStep = () => {
    if (!edgeData.parentStepId) return;
    openStepSelector(edgeData.parentStepId, { x: midX, y: midY });
  };

  return (
    <>
      <BaseEdge
        path={path}
        style={{ strokeWidth: `${LINE_WIDTH}px` }}
      />

      {/* Condition label */}
      {edgeData.condition && (
        <foreignObject
          x={midX + 8}
          y={midY - 20}
          width={80}
          height={20}
          className="overflow-visible pointer-events-none"
        >
          <div className="text-[10px] text-muted-foreground bg-background px-1 rounded border inline-block">
            {edgeData.condition}
          </div>
        </foreignObject>
      )}

      {/* Inline "+" button */}
      {!edgeData.hideAddButton && edgeLength > 40 && (
        <foreignObject
          x={midX - 9}
          y={midY - 9}
          width={18}
          height={18}
          className="overflow-visible"
        >
          <button
            onClick={handleAddStep}
            className="w-[18px] h-[18px] bg-background border-2 border-primary rounded-full flex items-center justify-center text-primary hover:bg-primary/10 transition-colors text-[10px] font-bold shadow-sm"
          >
            +
          </button>
        </foreignObject>
      )}
    </>
  );
});
