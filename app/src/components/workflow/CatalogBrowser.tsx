"use client";

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Browsable catalog of 810+ node types from Flowise, Langflow, and Mastra.
 * Allows searching, filtering by category, and dragging nodes onto the canvas.
 */

import { useState, useMemo, type DragEvent } from "react";
import {
  X, Search, Brain, Bot, Database, Wrench, FileText,
  Globe, Code2, Layers, ChevronRight, GripVertical,
} from "lucide-react";
import type { FlowiseNode } from "@/lib/flowise-node-types";
import { filterFlowiseNodes, groupBySection, getLangflowSection, getMastraSection } from "@/lib/flowise-node-types";
import flowiseCatalogData from "@/lib/flowise-node-catalog.json";
import langflowCatalogData from "@/lib/langflow-component-catalog.json";
import mastraCatalogData from "@/lib/mastra-node-catalog.json";

// Merge Flowise + Langflow into a unified catalog
const flowiseCatalog = (flowiseCatalogData as FlowiseNode[]).map((n) => ({ ...n, source: "flowise" as const }));
const langflowRaw = langflowCatalogData as unknown as Array<Record<string, unknown>>;
const langflowCatalog: FlowiseNode[] = langflowRaw.map((n) => ({
  name: String(n.name ?? ""),
  label: String(n.label ?? n.name ?? ""),
  type: String(n.type ?? ""),
  category: getLangflowSection(String(n.category ?? "")),
  description: String(n.description ?? ""),
  flowiseCategory: String(n.category ?? ""),
  inputs: Array.isArray(n.inputs)
    ? (n.inputs as Array<Record<string, string>>).map((i) => ({ label: i.label ?? i.name, name: i.name, type: i.type ?? "string" }))
    : [],
  source: "langflow" as const,
}));

const mastraRaw = mastraCatalogData as unknown as Array<Record<string, unknown>>;
const mastraCatalog: FlowiseNode[] = mastraRaw.map((n) => ({
  name: String(n.name ?? ""),
  label: String(n.label ?? n.name ?? ""),
  type: String(n.type ?? ""),
  category: getMastraSection(String(n.category ?? "")),
  description: String(n.description ?? ""),
  flowiseCategory: String(n.category ?? ""),
  inputs: Array.isArray(n.inputs)
    ? (n.inputs as Array<Record<string, string>>).map((i) => ({ label: i.label ?? i.name, name: i.name, type: i.type ?? "string" }))
    : [],
  source: "mastra" as const,
}));

const catalog = [...flowiseCatalog, ...langflowCatalog, ...mastraCatalog];

// Icon for each Pilox section
const sectionIcons: Record<string, typeof Brain> = {
  "AI / LLM": Brain,
  "Agents": Bot,
  "Memory": Database,
  "Vector Stores": Database,
  "Embeddings": Layers,
  "Tools": Wrench,
  "Prompts": FileText,
  "Document Loaders": FileText,
  "Text Splitters": Code2,
  "Chains": Globe,
  "Retrievers": Search,
};

// Map Flowise node type → Pilox stepType for canvas
function flowiseToStepType(node: FlowiseNode): string {
  const cat = node.category.toLowerCase();
  if (cat.includes("chat model") || cat.includes("llm")) return "llm";
  if (cat.includes("agent")) return "agent";
  if (cat.includes("memory")) return "memory";
  if (cat.includes("vector") || cat.includes("embedding")) return "rag";
  if (cat.includes("tool")) return "tool";
  if (cat.includes("chain")) return "llm";
  if (cat.includes("prompt")) return "prompt";
  if (cat.includes("document") || cat.includes("text splitter")) return "transform";
  if (cat.includes("retriever")) return "rag";
  return "tool";
}

interface CatalogBrowserProps {
  onClose: () => void;
  onAddNode?: (stepType: string, label: string, catalogDef: Record<string, unknown>) => void;
}

export function CatalogBrowser({ onClose, onAddNode }: CatalogBrowserProps) {
  const [search, setSearch] = useState("");
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  const filtered = useMemo(() => filterFlowiseNodes(catalog, search), [search]);
  const grouped = useMemo(() => groupBySection(filtered), [filtered]);

  const sections = useMemo(() => {
    const order = [
      "AI / LLM", "Agents", "Chains", "Memory", "Vector Stores",
      "Embeddings", "Tools", "Retrievers", "Document Loaders",
      "Text Splitters", "Prompts", "Moderation", "Cache",
      "Output Parsers", "Utilities",
    ];
    return order.filter((s) => grouped[s]?.length);
  }, [grouped]);

  // If a section is selected, show only that section's nodes
  const visibleSections = selectedSection
    ? sections.filter((s) => s === selectedSection)
    : sections;

  const onDragStart = (e: DragEvent, node: FlowiseNode) => {
    const stepType = flowiseToStepType(node);
    e.dataTransfer.setData("application/pilox-step-type", stepType);
    e.dataTransfer.setData("application/pilox-step-label", node.label);
    // Attach full catalog definition for dynamic config panel
    e.dataTransfer.setData("application/pilox-catalog-def", JSON.stringify({
      source: node.source ?? "flowise",
      name: node.name,
      label: node.label,
      category: node.category,
      description: node.description,
      inputs: node.inputs,
      credentials: node.credentials,
      baseClasses: node.baseClasses,
    }));
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-[60]" onClick={onClose} />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[680px] max-h-[80vh] bg-background border border-border rounded-xl shadow-2xl z-[61] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-[var(--pilox-fg-secondary)]">Node Catalog</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {catalog.length} nodes from Flowise + Langflow + Mastra — click or drag onto canvas
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[var(--pilox-surface-low)] text-muted-foreground hover:text-[var(--pilox-fg-secondary)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search + Section Filter */}
        <div className="px-5 py-3 border-b border-border space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search nodes... (e.g. ChatOllama, Pinecone, BufferMemory)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-background text-[var(--pilox-fg-secondary)] outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground"
              autoFocus
            />
          </div>
          {/* Section pills */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedSection(null)}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-colors ${
                !selectedSection
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "border-border text-muted-foreground hover:border-border hover:text-[var(--pilox-fg-secondary)]"
              }`}
            >
              All ({filtered.length})
            </button>
            {sections.map((s) => (
              <button
                key={s}
                onClick={() => setSelectedSection(selectedSection === s ? null : s)}
                className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-colors ${
                  selectedSection === s
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "border-border text-muted-foreground hover:border-border hover:text-[var(--pilox-fg-secondary)]"
                }`}
              >
                {s} ({grouped[s]?.length ?? 0})
              </button>
            ))}
          </div>
        </div>

        {/* Node List */}
        <div className="flex-1 overflow-y-auto">
          {visibleSections.map((section) => {
            const nodes = grouped[section] ?? [];
            const Icon = sectionIcons[section] ?? Layers;
            return (
              <div key={section} className="border-b border-border last:border-b-0">
                <div className="flex items-center gap-2 px-5 py-2.5 bg-[var(--pilox-surface-lowest)] sticky top-0 z-10">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {section}
                  </span>
                  <span className="text-[10px] text-muted-foreground">({nodes.length})</span>
                </div>
                <div className="grid grid-cols-2 gap-1 px-3 py-1.5">
                  {nodes.map((node) => (
                    <div
                      key={node.name}
                      draggable
                      onDragStart={(e) => onDragStart(e, node)}
                      onClick={() => {
                        if (!onAddNode) return;
                        const stepType = flowiseToStepType(node);
                        onAddNode(stepType, node.label, {
                          source: node.source ?? "flowise",
                          name: node.name,
                          label: node.label,
                          category: node.category,
                          description: node.description,
                          inputs: node.inputs,
                          credentials: node.credentials,
                          baseClasses: node.baseClasses,
                        });
                      }}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-[var(--pilox-surface-low)] transition-colors group"
                      title={node.description}
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10 shrink-0">
                        <ChevronRight className="h-3 w-3 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] font-medium text-[var(--pilox-fg-secondary)] truncate">{node.label}</span>
                          {node.source && (
                            <span className={`px-1 py-0 text-[8px] font-semibold rounded ${
                              node.source === "langflow" ? "bg-purple-500/10 text-purple-400"
                                : node.source === "mastra" ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-blue-500/10 text-blue-400"
                            }`}>
                              {node.source === "langflow" ? "LF" : node.source === "mastra" ? "MA" : "FW"}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">{node.description}</div>
                      </div>
                      <GripVertical className="h-3 w-3 text-border opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Search className="h-8 w-8 mb-3" />
              <p className="text-sm">No nodes found</p>
              <p className="text-xs mt-1">Try a different search term</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
