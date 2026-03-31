"use client";

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Main workflow canvas — wraps React Flow with custom node/edge types.
 * Adapted from thutasann/workflow-builder WorkflowCanvas (MIT).
 */

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  BackgroundVariant,
  ReactFlowProvider,
  ConnectionLineType,
  useReactFlow,
  type NodeMouseHandler,
  type IsValidConnection,
  type Node,
} from "@xyflow/react";
import {
  Undo2, Redo2, Bot, Sparkles, GitBranch, CircleStop, GripVertical,
  Brain, FileText, Search, Wrench, Database, Globe, Code2, Repeat,
  BookOpen, LayoutTemplate, ChevronDown, Hexagon,
} from "lucide-react";
import "@xyflow/react/dist/style.css";

import { useWorkflow } from "./WorkflowContext";
import { AgentStepNode } from "./nodes/AgentStepNode";
import { RouterNode } from "./nodes/RouterNode";
import { EndNode } from "./nodes/EndNode";
import { AddButtonNode } from "./nodes/AddButtonNode";
import { StepEdge } from "./edges/StepEdge";
import { StepSelector } from "./StepSelector";
import { CatalogBrowser } from "./CatalogBrowser";
import { TemplatePicker } from "./TemplatePicker";
import { WfNodeType, WfEdgeType } from "./types";
import { NODE_SIZE } from "./constants";

// ── Node & Edge type registries ──────────────────────

const nodeTypes = {
  [WfNodeType.STEP]: AgentStepNode,
  [WfNodeType.ROUTER]: RouterNode,
  [WfNodeType.ADD_BUTTON]: AddButtonNode,
  [WfNodeType.END_WIDGET]: EndNode,
};

const edgeTypes = {
  [WfEdgeType.STRAIGHT_LINE]: StepEdge,
};

// ── MiniMap node colors ──────────────────────────────

const miniMapNodeColor = (node: { type?: string; data?: Record<string, unknown> }): string => {
  const stepType = node.data?.stepType as string | undefined;
  switch (stepType) {
    case "start": return "#22c55e";
    case "agent": return "#3b82f6";
    case "transform": return "#8b5cf6";
    case "router": return "#f59e0b";
    case "end": return "#6b7280";
    case "llm": return "#06b6d4";
    case "prompt": return "#f97316";
    case "rag": return "#10b981";
    case "tool": return "#f43f5e";
    case "memory": return "#6366f1";
    case "http": return "#0ea5e9";
    case "code": return "#84cc16";
    case "loop": return "#d946ef";
    default: return "#94a3b8";
  }
};

// ── Palette items ────────────────────────────────────

interface PaletteCategory {
  label: string;
  items: Array<{ stepType: string; label: string; description: string; icon: typeof Bot; color: string; bg: string }>;
}

const paletteCategories: PaletteCategory[] = [
  {
    label: "AI / LLM",
    items: [
      { stepType: "llm", label: "LLM Call", description: "Chat completion", icon: Brain, color: "text-cyan-400", bg: "bg-cyan-500/10" },
      { stepType: "agent", label: "Agent", description: "Agent with tools", icon: Bot, color: "text-blue-400", bg: "bg-blue-500/10" },
      { stepType: "prompt", label: "Prompt", description: "Prompt template", icon: FileText, color: "text-orange-400", bg: "bg-orange-500/10" },
      { stepType: "rag", label: "RAG Search", description: "Vector search", icon: Search, color: "text-emerald-400", bg: "bg-emerald-500/10" },
      { stepType: "memory", label: "Memory", description: "Conversation memory", icon: Database, color: "text-indigo-400", bg: "bg-indigo-500/10" },
    ],
  },
  {
    label: "Actions",
    items: [
      { stepType: "tool", label: "Tool / MCP", description: "Call MCP tool", icon: Wrench, color: "text-rose-400", bg: "bg-rose-500/10" },
      { stepType: "http", label: "HTTP Request", description: "Call external API", icon: Globe, color: "text-sky-400", bg: "bg-sky-500/10" },
      { stepType: "code", label: "Code", description: "Custom code", icon: Code2, color: "text-lime-400", bg: "bg-lime-500/10" },
      { stepType: "transform", label: "Transform", description: "Transform data", icon: Sparkles, color: "text-violet-400", bg: "bg-violet-500/10" },
    ],
  },
  {
    label: "Flow Control",
    items: [
      { stepType: "router", label: "Router", description: "Conditional branch", icon: GitBranch, color: "text-amber-400", bg: "bg-amber-500/10" },
      { stepType: "loop", label: "Loop", description: "Iterate items", icon: Repeat, color: "text-fuchsia-400", bg: "bg-fuchsia-500/10" },
      { stepType: "end", label: "End", description: "Terminal node", icon: CircleStop, color: "text-gray-400", bg: "bg-gray-500/10" },
    ],
  },
];

function stepTypeToNodeType(stepType: string): string {
  switch (stepType) {
    case "end": return WfNodeType.END_WIDGET;
    case "router": return WfNodeType.ROUTER;
    default: return WfNodeType.STEP;
  }
}

// ── Node Palette (left sidebar) ──────────────────────

// Tailwind border-l color classes keyed by stepType (must be static strings for Tailwind JIT)
const leftAccent: Record<string, string> = {
  llm: "hover:border-l-cyan-400",
  agent: "hover:border-l-blue-400",
  prompt: "hover:border-l-orange-400",
  rag: "hover:border-l-emerald-400",
  memory: "hover:border-l-indigo-400",
  tool: "hover:border-l-rose-400",
  http: "hover:border-l-sky-400",
  code: "hover:border-l-lime-400",
  transform: "hover:border-l-violet-400",
  router: "hover:border-l-amber-400",
  loop: "hover:border-l-fuchsia-400",
  end: "hover:border-l-gray-400",
};

function NodePalette({
  onOpenCatalog,
  onOpenTemplates,
}: {
  onOpenCatalog: () => void;
  onOpenTemplates: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleSection = (label: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const q = searchQuery.toLowerCase();
  const filteredCategories = paletteCategories
    .map((cat) => ({
      ...cat,
      items: q
        ? cat.items.filter(
            (i) =>
              i.label.toLowerCase().includes(q) ||
              i.description.toLowerCase().includes(q),
          )
        : cat.items,
    }))
    .filter((cat) => cat.items.length > 0);

  const onDragStart = (e: DragEvent, stepType: string, label: string) => {
    e.dataTransfer.setData("application/pilox-step-type", stepType);
    e.dataTransfer.setData("application/pilox-step-label", label);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="absolute left-3 top-3 bottom-3 z-10 flex flex-col w-[220px] rounded-xl border border-border bg-background/95 backdrop-blur-md shadow-2xl">
      {/* Header */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 mb-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
            <Hexagon className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-[12px] font-semibold text-[var(--pilox-fg-secondary)]">Node Palette</span>
        </div>
        {/* Mini search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Quick find…"
            className="w-full h-7 pl-7 pr-2 rounded-md border border-border bg-card text-[11px] text-[var(--pilox-fg-secondary)] placeholder-[#404040] outline-none focus:border-[#333] transition-colors"
          />
        </div>
      </div>

      {/* Catalog + Templates */}
      <div className="px-2.5 pb-2 flex gap-1.5">
        <button
          onClick={onOpenCatalog}
          className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-primary/8 border border-primary/20 hover:bg-primary/15 transition-colors text-left"
        >
          <BookOpen className="h-3 w-3 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="text-[9px] font-semibold text-primary leading-tight">Catalog</div>
            <div className="text-[8px] text-muted-foreground">810+</div>
          </div>
        </button>
        <button
          onClick={onOpenTemplates}
          className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[var(--pilox-yellow)]/8 border border-[var(--pilox-yellow)]/20 hover:bg-[var(--pilox-yellow)]/15 transition-colors text-left"
        >
          <LayoutTemplate className="h-3 w-3 text-[var(--pilox-yellow)] shrink-0" />
          <div className="min-w-0">
            <div className="text-[9px] font-semibold text-[var(--pilox-yellow)] leading-tight">Templates</div>
            <div className="text-[8px] text-muted-foreground">75</div>
          </div>
        </button>
      </div>

      <div className="mx-2.5 border-t border-border" />

      {/* Node categories */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {filteredCategories.map((cat) => {
          const isOpen = !collapsed.has(cat.label);
          return (
            <div key={cat.label}>
              <button
                onClick={() => toggleSection(cat.label)}
                className="w-full flex items-center gap-1.5 px-1 py-1 rounded-md hover:bg-[var(--pilox-surface-low)] transition-colors"
              >
                <ChevronDown
                  className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${isOpen ? "" : "-rotate-90"}`}
                />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex-1 text-left">
                  {cat.label}
                </span>
                <span className="text-[9px] text-[#333] tabular-nums">{cat.items.length}</span>
              </button>

              <div
                className={`overflow-hidden transition-all duration-200 ease-out ${isOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}`}
              >
                <div className="mt-0.5 space-y-px">
                  {cat.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.stepType}
                        draggable
                        onDragStart={(e) => onDragStart(e, item.stepType, item.label)}
                        className={`flex items-center gap-2 px-2 py-2 rounded-lg cursor-grab active:cursor-grabbing border-l-2 border-transparent ${leftAccent[item.stepType] ?? ""} hover:bg-[var(--pilox-surface-low)] transition-all duration-150 group`}
                      >
                        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${item.bg} shrink-0`}>
                          <Icon className={`h-3.5 w-3.5 ${item.color}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-medium text-[var(--pilox-fg-secondary)] leading-tight">{item.label}</div>
                          <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{item.description}</div>
                        </div>
                        <GripVertical className="h-3 w-3 text-[#333] opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}

        {filteredCategories.length === 0 && searchQuery && (
          <div className="flex flex-col items-center py-6 text-muted-foreground">
            <Search className="h-5 w-5 mb-1.5" />
            <span className="text-[10px]">No match</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Canvas ───────────────────────────────────────────

function WorkflowCanvasInner() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    selectNode,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useWorkflow();

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getViewport } = useReactFlow();

  // Ctrl+Z / Ctrl+Shift+Z keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (node.type === WfNodeType.ADD_BUTTON || node.type === WfNodeType.END_WIDGET) return;
      selectNode(node.id);
    },
    [selectNode],
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  // Prevent invalid connections: no self-loops, no connecting to add-button,
  // and validate baseClasses compatibility for catalog nodes
  const isValidConnection: IsValidConnection = useCallback((connection) => {
    if (connection.source === connection.target) return false;
    const targetNode = nodes.find((n) => n.id === connection.target);
    if (targetNode?.type === WfNodeType.ADD_BUTTON) return false;

    // Check baseClasses compatibility when both nodes have catalog definitions
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const sourceDef = (sourceNode?.data as Record<string, unknown>)?.catalogDef as { baseClasses?: string[] } | undefined;
    const targetDef = (targetNode?.data as Record<string, unknown>)?.catalogDef as { inputs?: Array<{ type: string }> } | undefined;

    if (sourceDef?.baseClasses && targetDef?.inputs) {
      // Source must produce a type that target accepts
      const sourceClasses = new Set(sourceDef.baseClasses.map((c: string) => c.toLowerCase()));
      const targetAccepts = targetDef.inputs.map((i: { type: string }) => i.type.toLowerCase());
      // Allow if any input type matches any base class, or if either has "BaseLanguageModel" etc.
      const genericTypes = new Set(["string", "json", "object", "basemessage", "document"]);
      const hasMatch = targetAccepts.some((t: string) =>
        sourceClasses.has(t) || genericTypes.has(t),
      );
      // Only block if we're confident it's incompatible (both have rich type info)
      if (!hasMatch && sourceClasses.size > 0 && targetAccepts.length > 0
        && !targetAccepts.some((t: string) => genericTypes.has(t))) {
        return false;
      }
    }

    return true;
  }, [nodes]);

  // ── Drag-and-drop from palette ───────────────────
  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const stepType = e.dataTransfer.getData("application/pilox-step-type");
      const label = e.dataTransfer.getData("application/pilox-step-label");
      if (!stepType) return;

      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      // Center the node on the drop point
      position.x -= NODE_SIZE.step.width / 2;
      position.y -= NODE_SIZE.step.height / 2;
      // Snap to grid
      position.x = Math.round(position.x / 16) * 16;
      position.y = Math.round(position.y / 16) * 16;

      const uniqueId = `${stepType}-${Date.now()}`;
      const nodeType = stepTypeToNodeType(stepType);

      // Check for catalog definition (from Flowise/Langflow catalog browser)
      const catalogDefStr = e.dataTransfer.getData("application/pilox-catalog-def");
      let catalogDef: Record<string, unknown> | undefined;
      if (catalogDefStr) {
        try { catalogDef = JSON.parse(catalogDefStr); } catch { /* ignore */ }
      }

      const newNode: Node = {
        id: uniqueId,
        type: nodeType,
        position,
        data: {
          stepType,
          label: label || stepType,
          ...(catalogDef ? { catalogDef, catalogParams: {} } : {}),
        },
        draggable: true,
      };

      addNode(newNode);
      selectNode(uniqueId);
    },
    [screenToFlowPosition, addNode, selectNode],
  );

  const [showCatalog, setShowCatalog] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const onCatalogAddNode = useCallback(
    (stepType: string, label: string, catalogDef: Record<string, unknown>) => {
      const wrapper = reactFlowWrapper.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      // Place node at viewport center
      const position = screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      position.x = Math.round(position.x / 16) * 16;
      position.y = Math.round(position.y / 16) * 16;

      const uniqueId = `${stepType}-${Date.now()}`;
      const nodeType = stepTypeToNodeType(stepType);
      const newNode: Node = {
        id: uniqueId,
        type: nodeType,
        position,
        data: { stepType, label, catalogDef, catalogParams: {} },
        draggable: true,
      };
      addNode(newNode);
      selectNode(uniqueId);
    },
    [screenToFlowPosition, addNode, selectNode],
  );

  return (
    <div ref={reactFlowWrapper} className="relative w-full h-full">
      <NodePalette
        onOpenCatalog={() => setShowCatalog(true)}
        onOpenTemplates={() => setShowTemplates(true)}
      />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        isValidConnection={isValidConnection}
        onDragOver={onDragOver}
        onDrop={onDrop}
        connectionLineType={ConnectionLineType.SmoothStep}
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        minZoom={0.25}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Panel position="top-left" className="flex gap-1 !left-[190px]">
          <button
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="flex h-8 w-8 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-accent disabled:opacity-30"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            className="flex h-8 w-8 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-accent disabled:opacity-30"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </Panel>
        <Controls />
        <MiniMap
          nodeStrokeWidth={2}
          nodeColor={miniMapNodeColor}
          pannable
          zoomable
          className="!bg-background/80 !border"
        />
      </ReactFlow>
      <StepSelector />
      {showCatalog && <CatalogBrowser onClose={() => setShowCatalog(false)} onAddNode={onCatalogAddNode} />}
      {showTemplates && <TemplatePicker onClose={() => setShowTemplates(false)} />}
    </div>
  );
}

/**
 * Exported canvas — wraps inner in ReactFlowProvider.
 * Must be used inside a <WorkflowProvider>.
 */
export function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner />
    </ReactFlowProvider>
  );
}
