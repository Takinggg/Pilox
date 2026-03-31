"use client";

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Step selector popup — choose which step type to add to the workflow.
 * Adapted from thutasann/workflow-builder StepSelector (MIT).
 *
 * Extended with AI-specific node types: LLM, Prompt, RAG, Tool, Memory, HTTP, Code, Loop.
 */

import { useState, useEffect, useCallback } from "react";
import { useWorkflow } from "./WorkflowContext";
import { NODE_SIZE, VERTICAL_SPACE_BETWEEN_STEPS } from "./constants";
import { WfNodeType, WfEdgeType } from "./types";
import type { Node, Edge } from "@xyflow/react";
import {
  Bot, GitBranch, CircleStop, Sparkles,
  Brain, FileText, Search, Wrench, Database, Globe, Code2, Repeat,
} from "lucide-react";

interface StepOption {
  id: string;
  stepType: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: "ai" | "actions" | "flow";
}

const stepOptions: StepOption[] = [
  // AI / LLM
  { id: "llm", stepType: "llm", label: "LLM Call", description: "Chat completion with any model", icon: <Brain className="h-5 w-5" />, category: "ai" },
  { id: "agent", stepType: "agent", label: "Agent Step", description: "Execute an AI agent with tools", icon: <Bot className="h-5 w-5" />, category: "ai" },
  { id: "prompt", stepType: "prompt", label: "Prompt Template", description: "Build a prompt with variables", icon: <FileText className="h-5 w-5" />, category: "ai" },
  { id: "rag", stepType: "rag", label: "RAG Search", description: "Vector similarity search", icon: <Search className="h-5 w-5" />, category: "ai" },
  { id: "memory", stepType: "memory", label: "Memory", description: "Read/write conversation memory", icon: <Database className="h-5 w-5" />, category: "ai" },
  // Actions
  { id: "tool", stepType: "tool", label: "Tool / MCP", description: "Call an MCP tool", icon: <Wrench className="h-5 w-5" />, category: "actions" },
  { id: "http", stepType: "http", label: "HTTP Request", description: "Call an external API", icon: <Globe className="h-5 w-5" />, category: "actions" },
  { id: "code", stepType: "code", label: "Code", description: "Run custom JavaScript/Python", icon: <Code2 className="h-5 w-5" />, category: "actions" },
  { id: "transform", stepType: "transform", label: "Transform", description: "Transform data with templates", icon: <Sparkles className="h-5 w-5" />, category: "actions" },
  // Flow Control
  { id: "router", stepType: "router", label: "Router", description: "Conditional branching", icon: <GitBranch className="h-5 w-5" />, category: "flow" },
  { id: "loop", stepType: "loop", label: "Loop", description: "Iterate over items", icon: <Repeat className="h-5 w-5" />, category: "flow" },
  { id: "end", stepType: "end", label: "End", description: "Terminal node", icon: <CircleStop className="h-5 w-5" />, category: "flow" },
];

const categoryLabels: Record<string, string> = {
  ai: "AI / LLM",
  actions: "Actions",
  flow: "Flow Control",
};

/** Map step type to React Flow node type. */
function stepTypeToNodeType(stepType: string): string {
  switch (stepType) {
    case "end": return WfNodeType.END_WIDGET;
    case "router": return WfNodeType.ROUTER;
    default: return WfNodeType.STEP;
  }
}

export function StepSelector() {
  const { stepSelector, closeStepSelector, addNode, setNodes, setEdges, nodes, edges } = useWorkflow();
  const [search, setSearch] = useState("");
  const [focusedIdx, setFocusedIdx] = useState(0);

  // Filter for keyboard
  const getFiltered = useCallback(() =>
    stepOptions.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()) || o.description.toLowerCase().includes(search.toLowerCase())),
    [search],
  );

  // Keyboard: Escape, arrows, Enter
  useEffect(() => {
    if (!stepSelector.isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { closeStepSelector(); return; }
      const filtered = getFiltered();
      if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIdx((i) => (i + 1) % filtered.length); }
      if (e.key === "ArrowUp") { e.preventDefault(); setFocusedIdx((i) => (i - 1 + filtered.length) % filtered.length); }
      if (e.key === "Enter" && filtered.length > 0) { e.preventDefault(); handleSelect(filtered[focusedIdx % filtered.length]); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [stepSelector.isOpen, closeStepSelector, search, focusedIdx, getFiltered]);

  const handleSelect = useCallback(
    (option: StepOption) => {
      const parentId = stepSelector.parentStepId;
      if (!parentId) return;

      const uniqueId = `${option.stepType}-${Date.now()}`;
      const nodeType = stepTypeToNodeType(option.stepType);

      // Find parent node position for placement
      const parentNode = nodes.find((n) => n.id === parentId);
      const parentY = parentNode?.position.y ?? 0;
      const parentX = parentNode?.position.x ?? 0;

      const newY = parentY + NODE_SIZE.step.height + VERTICAL_SPACE_BETWEEN_STEPS;

      // Shift any existing nodes below parent down to make room
      const shiftAmount = NODE_SIZE.step.height + VERTICAL_SPACE_BETWEEN_STEPS;
      setNodes((nds) => nds.map((n) => {
        if (n.id !== parentId && n.position.y >= newY) {
          return { ...n, position: { ...n.position, y: n.position.y + shiftAmount } };
        }
        return n;
      }));

      // Remove existing edge from parent to its current child (we'll re-route)
      const existingChildEdge = edges.find((e) => e.source === parentId);
      const existingChildId = existingChildEdge?.target;

      const newNode: Node = {
        id: uniqueId,
        type: nodeType,
        position: { x: parentX, y: newY },
        data: {
          stepType: option.stepType,
          label: option.label,
        },
        draggable: true,
      };

      addNode(newNode);

      // Build new edges
      setEdges((eds) => {
        let updated = eds;

        // Remove old edge from parent → old child
        if (existingChildEdge) {
          updated = updated.filter((e) => e.id !== existingChildEdge.id);
        }

        // Edge: parent → new node
        const edgeToNew: Edge = {
          id: `${parentId}-${uniqueId}`,
          source: parentId,
          target: uniqueId,
          type: WfEdgeType.STRAIGHT_LINE,
          data: { parentStepId: parentId },
        };
        updated = [...updated, edgeToNew];

        // If the new node is not "end" and not "router", reconnect to old child
        if (option.stepType !== "end" && option.stepType !== "router" && existingChildId) {
          const edgeToChild: Edge = {
            id: `${uniqueId}-${existingChildId}`,
            source: uniqueId,
            target: existingChildId,
            type: WfEdgeType.STRAIGHT_LINE,
            data: { parentStepId: uniqueId },
          };
          updated = [...updated, edgeToChild];
        }

        return updated;
      });

      closeStepSelector();
      setSearch("");
      setFocusedIdx(0);
    },
    [stepSelector.parentStepId, nodes, edges, addNode, setNodes, setEdges, closeStepSelector],
  );

  if (!stepSelector.isOpen) return null;

  const filtered = getFiltered();
  const categories = ["ai", "actions", "flow"] as const;

  // Flat list for keyboard nav
  let globalIdx = 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-50"
        onClick={closeStepSelector}
      />

      {/* Popup */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[460px] max-h-[75vh] bg-background border rounded-xl shadow-xl z-[51] flex flex-col">
        {/* Search */}
        <div className="p-4 border-b">
          <input
            type="text"
            placeholder="Search nodes... (e.g. LLM, RAG, HTTP)"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setFocusedIdx(0); }}
            className="w-full px-3 py-2 text-sm border rounded-md bg-background outline-none focus:ring-2 focus:ring-primary/30"
            autoFocus
          />
        </div>

        {/* Options */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {categories.map((cat) => {
            const catSteps = filtered.filter((o) => o.category === cat);
            if (catSteps.length === 0) return null;
            return (
              <div key={cat}>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {categoryLabels[cat]}
                </h3>
                <div className="space-y-1">
                  {catSteps.map((option) => {
                    const idx = globalIdx++;
                    return (
                      <StepOptionRow
                        key={option.id}
                        option={option}
                        focused={focusedIdx % filtered.length === idx}
                        onSelect={() => handleSelect(option)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-8">
              No results found
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function StepOptionRow({
  option,
  focused,
  onSelect,
}: {
  option: StepOption;
  focused: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition-colors text-left ${
        focused ? "bg-muted ring-1 ring-primary/30" : ""
      }`}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
        {option.icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium">{option.label}</div>
        <div className="text-xs text-muted-foreground">{option.description}</div>
      </div>
    </button>
  );
}
