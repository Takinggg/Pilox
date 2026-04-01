// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

export interface WorkflowNode {
  id: string;
  type:
    | "start"
    | "end"
    | "agent"
    | "router"
    | "transform"
    | "llm"
    | "prompt"
    | "rag"
    | "tool"
    | "memory"
    | "http"
    | "code"
    | "loop"
    | "embedding"
    | "classifier"
    | "image-gen"
    | "audio";
  data: {
    agentId?: string;
    /** Action for non-agent nodes: "passthrough" | "filter" | "map" */
    action?: string;
    /** Condition expression for router nodes (JavaScript-like string evaluated safely). */
    condition?: string;
    /** For transform nodes: variable key to write result to. */
    outputVariable?: string;
    /** Inline template to produce text (supports {{var}} substitution). */
    template?: string;
    /** Timeout per node in seconds (default: 120). */
    timeoutSeconds?: number;
    /** Max retries on failure (default: 0). */
    maxRetries?: number;
    label?: string;
    // LLM node
    model?: string;
    provider?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    // RAG node
    collection?: string;
    topK?: number;
    embeddingModel?: string;
    // Tool / MCP node
    toolName?: string;
    mcpServer?: string;
    toolParams?: string;
    // Memory node
    memoryType?: string;
    memoryAction?: string;
    sessionKey?: string;
    // HTTP node
    url?: string;
    method?: string;
    headers?: string;
    body?: string;
    // Code node
    language?: string;
    codeContent?: string;
    // Loop node
    loopVariable?: string;
    maxIterations?: number;
    // Classifier node
    classifierLabels?: string;
    // Image gen node
    imageSize?: string;
    // Audio node
    audioAction?: string;
    voice?: string;
    // Canvas position (persisted for layout restoration)
    _position?: { x: number; y: number };
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  data?: {
    /** Condition label for router edges (e.g. "true", "false", "default"). */
    condition?: string;
    /** Variable mapping: { targetVar: sourceVar } — copies variables between steps. */
    variableMap?: Record<string, string>;
  };
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface StepResult {
  nodeId: string;
  nodeType: string;
  status: "success" | "failed" | "skipped";
  output?: unknown;
  durationMs: number;
  error?: string;
}

export interface WorkflowExecutionResult {
  status: "completed" | "failed";
  output: Record<string, unknown>;
  steps: StepResult[];
  error?: string;
}

