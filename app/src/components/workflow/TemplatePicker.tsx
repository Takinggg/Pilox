"use client";

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Template picker — browse 200 AI workflow templates from n8n.
 * Click a template to load it as a starting point on the canvas.
 */

import { useState, useMemo } from "react";
import { X, Search, Zap, Tag, ArrowRight } from "lucide-react";
import type { N8nTemplate, N8nConnections } from "@/lib/flowise-node-types";
import { filterTemplates } from "@/lib/flowise-node-types";
import { useWorkflow } from "./WorkflowContext";
import { WfNodeType, WfEdgeType } from "./types";
import type { Node, Edge } from "@xyflow/react";
import templateData from "@/lib/n8n-workflow-templates.json";

const templates = templateData as unknown as N8nTemplate[];

// All unique tags sorted
const allTags = [...new Set(templates.flatMap((t) => t.tags))].sort();

// Map n8n node types to Pilox stepTypes
function n8nTypeToStepType(n8nType: string): string {
  const t = n8nType.toLowerCase();
  if (t.includes("agent")) return "agent";
  if (t.includes("lmchat") || t.includes("llm") || t.includes("lm")) return "llm";
  if (t.includes("memory")) return "memory";
  if (t.includes("vector") || t.includes("embedding") || t.includes("retrieval")) return "rag";
  if (t.includes("tool")) return "tool";
  if (t.includes("prompt") || t.includes("template")) return "prompt";
  if (t.includes("chain") || t.includes("summariz")) return "llm";
  if (t.includes("http") || t.includes("webhook")) return "http";
  if (t.includes("code") || t.includes("function")) return "code";
  if (t.includes("splitinbatches") || t.includes("loop")) return "loop";
  if (t.includes("if") || t.includes("switch") || t.includes("router")) return "router";
  return "transform";
}

function stepTypeToNodeType(stepType: string): string {
  switch (stepType) {
    case "end": return WfNodeType.END_WIDGET;
    case "router": return WfNodeType.ROUTER;
    default: return WfNodeType.STEP;
  }
}

interface TemplatePickerProps {
  onClose: () => void;
}

export function TemplatePicker({ onClose }: TemplatePickerProps) {
  const { setNodes, setEdges } = useWorkflow();
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | undefined>();

  const filtered = useMemo(
    () => filterTemplates(templates, search, selectedTag),
    [search, selectedTag],
  );

  const loadTemplate = (template: N8nTemplate) => {
    const tplNodes = template.nodes ?? [];
    const tplConns = template.connections ?? {};

    // Filter out non-essential n8n nodes
    const skipTypes = new Set(["n8n-nodes-base.stickyNote", "n8n-nodes-base.noOp"]);
    const usableNodes = tplNodes.filter((n) => !skipTypes.has(n.type));

    if (usableNodes.length === 0) {
      return loadTemplateFallback(template);
    }

    // Build name→id map (n8n connections reference nodes by name)
    const nameToId = new Map<string, string>();
    for (const n8nNode of usableNodes) {
      const stepType = n8nTypeToStepType(n8nNode.type);
      const piloxId = `${stepType}-${n8nNode.id || Math.random().toString(36).slice(2, 8)}`;
      nameToId.set(n8nNode.name, piloxId);
    }

    // Parse ALL connection types (main + ai_languageModel, ai_tool, ai_memory, etc.)
    const edgePairs: Array<{ sourceId: string; targetId: string }> = [];
    for (const [sourceName, connDef] of Object.entries(tplConns)) {
      const sourceId = nameToId.get(sourceName);
      if (!sourceId) continue;
      // connDef has keys: main, ai_tool, ai_languageModel, ai_memory, etc.
      for (const outputs of Object.values(connDef as Record<string, Array<Array<{ node: string; type: string; index: number }>>>)) {
        if (!Array.isArray(outputs)) continue;
        for (const group of outputs) {
          if (!Array.isArray(group)) continue;
          for (const conn of group) {
            const targetId = nameToId.get(conn.node);
            if (targetId) edgePairs.push({ sourceId, targetId });
          }
        }
      }
    }

    // Build connected set — only keep nodes that participate in at least one connection
    const connectedIds = new Set<string>();
    for (const { sourceId, targetId } of edgePairs) {
      connectedIds.add(sourceId);
      connectedIds.add(targetId);
    }

    // If many nodes are disconnected (showcase "App" nodes), filter them out
    const filteredUsable = connectedIds.size >= 2
      ? usableNodes.filter((n) => connectedIds.has(nameToId.get(n.name)!))
      : usableNodes;

    // Build nodes with auto-layout (topological sort + grid)
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    const startId = "start-1";
    newNodes.push({
      id: startId,
      type: WfNodeType.STEP,
      position: { x: 0, y: 0 },
      data: { stepType: "start", label: "Start" },
      draggable: true,
    });

    // Topological layer assignment for clean layout
    const idToNode = new Map(filteredUsable.map((n) => [nameToId.get(n.name)!, n]));
    const childrenMap = new Map<string, string[]>();
    const parentCount = new Map<string, number>();
    for (const id of idToNode.keys()) {
      childrenMap.set(id, []);
      parentCount.set(id, 0);
    }
    for (const { sourceId, targetId } of edgePairs) {
      if (!idToNode.has(sourceId) || !idToNode.has(targetId)) continue;
      childrenMap.get(sourceId)!.push(targetId);
      parentCount.set(targetId, (parentCount.get(targetId) ?? 0) + 1);
    }

    // BFS layer assignment
    const layers = new Map<string, number>();
    const queue: string[] = [];
    for (const [id, count] of parentCount) {
      if (count === 0) { layers.set(id, 0); queue.push(id); }
    }
    let qi = 0;
    while (qi < queue.length) {
      const id = queue[qi++];
      const layer = layers.get(id) ?? 0;
      for (const child of childrenMap.get(id) ?? []) {
        const existing = layers.get(child) ?? -1;
        if (layer + 1 > existing) {
          layers.set(child, layer + 1);
          queue.push(child);
        }
      }
    }
    // Assign layer 0 to any remaining (cycles)
    for (const id of idToNode.keys()) {
      if (!layers.has(id)) layers.set(id, 0);
    }

    // Group by layer and position on grid
    const layerGroups = new Map<number, string[]>();
    for (const [id, layer] of layers) {
      if (!layerGroups.has(layer)) layerGroups.set(layer, []);
      layerGroups.get(layer)!.push(id);
    }
    const sortedLayers = [...layerGroups.keys()].sort((a, b) => a - b);

    const NODE_W = 220;
    const NODE_H = 140;

    for (const layer of sortedLayers) {
      const ids = layerGroups.get(layer) ?? [];
      const totalWidth = ids.length * NODE_W;
      const startX = -totalWidth / 2 + NODE_W / 2;

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const n8nNode = idToNode.get(id);
        if (!n8nNode) continue;

        const stepType = n8nTypeToStepType(n8nNode.type);
        const shortLabel = n8nNode.name.length > 28 ? n8nNode.name.slice(0, 25) + "..." : n8nNode.name;

        newNodes.push({
          id,
          type: stepTypeToNodeType(stepType),
          position: {
            x: Math.round(startX + i * NODE_W),
            y: Math.round((layer + 1) * NODE_H),
          },
          data: { stepType, label: shortLabel },
          draggable: true,
        });
      }
    }

    // Create edges
    const addedEdges = new Set<string>();
    for (const { sourceId, targetId } of edgePairs) {
      if (!idToNode.has(sourceId) || !idToNode.has(targetId)) continue;
      const key = `${sourceId}-${targetId}`;
      if (addedEdges.has(key)) continue;
      addedEdges.add(key);
      newEdges.push({
        id: key,
        source: sourceId,
        target: targetId,
        type: WfEdgeType.STRAIGHT_LINE,
        data: { parentStepId: sourceId },
      });
    }

    // Connect Start → root nodes (no incoming edges)
    const targetsSet = new Set(newEdges.map((e) => e.target));
    for (const n of newNodes) {
      if (n.id !== startId && !targetsSet.has(n.id)) {
        newEdges.push({
          id: `${startId}-${n.id}`,
          source: startId,
          target: n.id,
          type: WfEdgeType.STRAIGHT_LINE,
          data: { parentStepId: startId },
        });
      }
    }

    // Connect leaf nodes → End
    const sourcesSet = new Set(newEdges.map((e) => e.source));
    const leafNodes = newNodes.filter((n) => n.id !== startId && !sourcesSet.has(n.id));
    if (leafNodes.length > 0) {
      const endId = `end-${Date.now()}`;
      const maxY = Math.max(...newNodes.map((n) => n.position.y));
      newNodes.push({
        id: endId,
        type: WfNodeType.END_WIDGET,
        position: { x: 0, y: maxY + NODE_H },
        data: { stepType: "end", label: "End" },
        draggable: true,
      });
      for (const leaf of leafNodes) {
        newEdges.push({
          id: `${leaf.id}-${endId}`,
          source: leaf.id,
          target: endId,
          type: WfEdgeType.STRAIGHT_LINE,
          data: { parentStepId: leaf.id },
        });
      }
    }

    setNodes(newNodes);
    setEdges(newEdges);
    onClose();
  };

  // Fallback for templates without node data: linear layout from nodeTypes
  const loadTemplateFallback = (template: N8nTemplate) => {
    const nodeTypes = template.nodeTypes.filter(
      (t) => !t.includes("stickyNote") && !t.includes("manualTrigger") && !t.includes("noOp"),
    );

    const newNodes: Node[] = [{
      id: "start-1",
      type: WfNodeType.STEP,
      position: { x: 0, y: 0 },
      data: { stepType: "start", label: "Start" },
      draggable: true,
    }];
    const newEdges: Edge[] = [];
    let y = 160;

    for (const n8nType of nodeTypes) {
      const stepType = n8nTypeToStepType(n8nType);
      const id = `${stepType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const shortLabel = n8nType.split(".").pop()?.replace(/([A-Z])/g, " $1").trim() ?? n8nType;

      newNodes.push({
        id,
        type: stepTypeToNodeType(stepType),
        position: { x: 0, y },
        data: { stepType, label: shortLabel.length > 25 ? shortLabel.slice(0, 22) + "..." : shortLabel },
        draggable: true,
      });

      const prevId = newNodes[newNodes.length - 2].id;
      newEdges.push({
        id: `${prevId}-${id}`,
        source: prevId,
        target: id,
        type: WfEdgeType.STRAIGHT_LINE,
        data: { parentStepId: prevId },
      });
      y += 120;
    }

    const endId = `end-${Date.now()}`;
    newNodes.push({
      id: endId,
      type: WfNodeType.END_WIDGET,
      position: { x: 0, y },
      data: { stepType: "end", label: "End" },
      draggable: true,
    });
    if (newNodes.length >= 2) {
      const prevId = newNodes[newNodes.length - 2].id;
      newEdges.push({
        id: `${prevId}-${endId}`,
        source: prevId,
        target: endId,
        type: WfEdgeType.STRAIGHT_LINE,
        data: { parentStepId: prevId },
      });
    }

    setNodes(newNodes);
    setEdges(newEdges);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-[60]" onClick={onClose} />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] max-h-[80vh] bg-background border border-border rounded-xl shadow-2xl z-[61] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-[var(--pilox-fg-secondary)]">Workflow Templates</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {templates.length} AI workflow templates from n8n — click to load
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[var(--pilox-surface-low)] text-muted-foreground hover:text-[var(--pilox-fg-secondary)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search + Tag Filter */}
        <div className="px-5 py-3 border-b border-border space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search templates... (e.g. chatbot, RAG, email)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-background text-[var(--pilox-fg-secondary)] outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground"
              autoFocus
            />
          </div>
          {/* Tag pills */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedTag(undefined)}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-colors ${
                !selectedTag
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "border-border text-muted-foreground hover:border-border hover:text-[var(--pilox-fg-secondary)]"
              }`}
            >
              All ({filtered.length})
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? undefined : tag)}
                className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded-full border transition-colors ${
                  selectedTag === tag
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "border-border text-muted-foreground hover:border-border hover:text-[var(--pilox-fg-secondary)]"
                }`}
              >
                <Tag className="h-2.5 w-2.5" />
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Template List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.map((template) => (
            <button
              key={template.id}
              onClick={() => loadTemplate(template)}
              className="w-full flex items-start gap-3 px-5 py-3.5 border-b border-border hover:bg-[var(--pilox-surface-low)] transition-colors text-left group"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0 mt-0.5">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-[var(--pilox-fg-secondary)] leading-snug">
                  {template.name}
                </div>
                {template.description && (
                  <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                    {template.description}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-muted-foreground">
                    {template.nodeCount} nodes
                  </span>
                  {template.tags.length > 0 && (
                    <div className="flex gap-1">
                      {template.tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-[var(--pilox-border)] text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-border group-hover:text-primary transition-colors shrink-0 mt-2" />
            </button>
          ))}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Search className="h-8 w-8 mb-3" />
              <p className="text-sm">No templates found</p>
              <p className="text-xs mt-1">Try a different search term or tag</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
