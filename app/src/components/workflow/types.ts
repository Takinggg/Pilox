// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Workflow canvas types — adapted from thutasann/workflow-builder (MIT).
 *
 * Extended for Pilox's agent-centric model with AI-specific node types:
 * LLM, Prompt, RAG, Tool/MCP, Memory, HTTP, Code, Loop.
 */

// ── Node Types ──────────────────────────────────────

export enum WfNodeType {
  STEP = "step",
  ROUTER = "router",
  ADD_BUTTON = "addButton",
  END_WIDGET = "endWidget",
}

export enum WfEdgeType {
  STRAIGHT_LINE = "straightLine",
}

/** Matches workflow-executor.ts node types. */
export type StepType =
  | "start"
  | "end"
  | "agent"
  | "router"
  | "transform"
  // AI-specific node types
  | "llm"
  | "prompt"
  | "rag"
  | "tool"
  | "memory"
  | "http"
  | "code"
  | "loop";

/** Flowise/Langflow catalog metadata attached to a node when dragged from catalog */
export interface CatalogNodeDef {
  source: "flowise" | "langflow" | "mastra";
  name: string;
  label: string;
  category: string;
  description: string;
  inputs: Array<{ label: string; name: string; type: string; default?: string; options?: string[] }>;
  credentials?: string[];
  baseClasses?: string[];
}

export interface StepData {
  stepType: StepType;
  label: string;
  /** When dragged from catalog, carries the full node definition for dynamic config */
  catalogDef?: CatalogNodeDef;
  /** Dynamic key-value params from catalog node inputs */
  catalogParams?: Record<string, unknown>;
  // Agent step
  agentId?: string;
  // Router
  condition?: string;
  // Transform / Prompt
  template?: string;
  outputVariable?: string;
  // LLM
  model?: string;
  provider?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  // RAG
  collection?: string;
  topK?: number;
  embeddingModel?: string;
  // Tool / MCP
  toolName?: string;
  mcpServer?: string;
  toolParams?: string; // JSON string
  // Memory
  memoryType?: string; // "buffer" | "vector" | "summary"
  memoryAction?: string; // "read" | "write" | "clear"
  sessionKey?: string;
  // HTTP
  url?: string;
  method?: string;
  headers?: string; // JSON string
  body?: string;
  // Code
  language?: string; // "javascript" | "python"
  codeContent?: string;
  // Loop
  loopVariable?: string;
  maxIterations?: number;
  // Common
  timeoutSeconds?: number;
  maxRetries?: number;
}

export interface AddButtonData {
  parentStepId: string;
  branchIndex?: number;
}

export interface EndWidgetData {
  stepType: "end";
  showWidget?: boolean;
}

// ── Bounding Box ────────────────────────────────────

export interface BoundingBox {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}
