"use client";

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Unified step node — renders all step types including AI-specific nodes.
 * Adapted from thutasann/workflow-builder ApStepNode (MIT).
 */

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Bot, Sparkles, GitBranch, Play, Trash2,
  Brain, FileText, Search, Wrench, Database,
  Globe, Code2, Repeat, Binary, Tag, ImageIcon, Mic,
} from "lucide-react";
import { useWorkflow } from "../WorkflowContext";
import { HANDLE_STYLING, NODE_SIZE } from "../constants";
import type { StepData, StepType } from "../types";

const iconMap: Record<StepType, React.ReactNode> = {
  agent: <Bot className="h-4 w-4" />,
  transform: <Sparkles className="h-4 w-4" />,
  router: <GitBranch className="h-4 w-4" />,
  start: <Play className="h-4 w-4" />,
  end: null,
  // AI-specific
  llm: <Brain className="h-4 w-4" />,
  prompt: <FileText className="h-4 w-4" />,
  rag: <Search className="h-4 w-4" />,
  tool: <Wrench className="h-4 w-4" />,
  memory: <Database className="h-4 w-4" />,
  http: <Globe className="h-4 w-4" />,
  code: <Code2 className="h-4 w-4" />,
  loop: <Repeat className="h-4 w-4" />,
  embedding: <Binary className="h-4 w-4" />,
  classifier: <Tag className="h-4 w-4" />,
  "image-gen": <ImageIcon className="h-4 w-4" />,
  audio: <Mic className="h-4 w-4" />,
};

const colorMap: Record<StepType, { bg: string; border: string; icon: string }> = {
  agent: { bg: "bg-primary/10", border: "border-primary", icon: "text-primary" },
  transform: { bg: "bg-violet-500/10", border: "border-violet-500", icon: "text-violet-500" },
  router: { bg: "bg-amber-500/10", border: "border-amber-500", icon: "text-amber-500" },
  start: { bg: "bg-green-500/10", border: "border-green-500", icon: "text-green-500" },
  end: { bg: "bg-muted", border: "border-border", icon: "text-muted-foreground" },
  // AI-specific
  llm: { bg: "bg-cyan-500/10", border: "border-cyan-500", icon: "text-cyan-500" },
  prompt: { bg: "bg-orange-500/10", border: "border-orange-500", icon: "text-orange-500" },
  rag: { bg: "bg-emerald-500/10", border: "border-emerald-500", icon: "text-emerald-500" },
  tool: { bg: "bg-rose-500/10", border: "border-rose-500", icon: "text-rose-500" },
  memory: { bg: "bg-indigo-500/10", border: "border-indigo-500", icon: "text-indigo-500" },
  http: { bg: "bg-sky-500/10", border: "border-sky-500", icon: "text-sky-500" },
  code: { bg: "bg-lime-500/10", border: "border-lime-500", icon: "text-lime-500" },
  loop: { bg: "bg-fuchsia-500/10", border: "border-fuchsia-500", icon: "text-fuchsia-500" },
  embedding: { bg: "bg-teal-500/10", border: "border-teal-500", icon: "text-teal-500" },
  classifier: { bg: "bg-pink-500/10", border: "border-pink-500", icon: "text-pink-500" },
  "image-gen": { bg: "bg-purple-500/10", border: "border-purple-500", icon: "text-purple-500" },
  audio: { bg: "bg-yellow-500/10", border: "border-yellow-500", icon: "text-yellow-500" },
};

function getSubtitle(data: StepData): string {
  const t = data.stepType;
  if (t === "start") return "Workflow entry point";
  if (t === "agent") return data.agentId ? "Agent configured" : "Click to configure";
  if (t === "transform") return data.template ? "Template set" : "Click to configure";
  if (t === "router") return data.condition ? "Condition set" : "Conditional branching";
  if (t === "llm") return data.model ? `Model: ${data.model}` : "Select a model";
  if (t === "prompt") return data.template ? "Template set" : "Define prompt template";
  if (t === "rag") return data.collection ? `Collection: ${data.collection}` : "Configure vector search";
  if (t === "tool") return data.toolName ? `Tool: ${data.toolName}` : "Select MCP tool";
  if (t === "memory") return data.memoryAction ? `${data.memoryAction} memory` : "Configure memory";
  if (t === "http") return data.url ? `${data.method ?? "GET"} ${data.url.slice(0, 30)}` : "Configure HTTP request";
  if (t === "code") return data.language ? `${data.language}` : "Write custom code";
  if (t === "loop") return data.loopVariable ? `Loop: ${data.loopVariable}` : "Configure loop";
  return "Click to configure";
}

export const AgentStepNode = memo(function AgentStepNode({
  id,
  data,
  selected,
}: NodeProps) {
  const { deleteNode, selectedNodeId } = useWorkflow();
  const stepData = data as unknown as StepData;
  const stepType = stepData.stepType ?? "agent";
  const colors = colorMap[stepType] ?? colorMap.agent;
  const isSelected = selected || selectedNodeId === id;
  const isStart = stepType === "start";

  return (
    <div
      style={{ width: NODE_SIZE.step.width }}
      className={`rounded-lg border-2 bg-card px-4 py-3 shadow-sm ${
        isSelected ? `${colors.border} ring-2 ring-primary/20` : "border-border"
      }`}
    >
      {/* Target handle (hidden for start node) */}
      {!isStart && (
        <Handle type="target" position={Position.Top} style={HANDLE_STYLING} />
      )}

      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-md ${colors.bg}`}>
          <span className={colors.icon}>{iconMap[stepType]}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {stepData.label || stepType.charAt(0).toUpperCase() + stepType.slice(1)}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {getSubtitle(stepData)}
          </div>
        </div>

        {/* Delete button (not for start) */}
        {!isStart && isSelected && (
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

      {/* Source handle */}
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLING} />
    </div>
  );
});
