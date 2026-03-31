// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Types and helpers for the Flowise-imported node catalog.
 * 246 nodes extracted from FlowiseAI/Flowise (MIT).
 */

export interface FlowiseNodeInput {
  label: string;
  name: string;
  type: string;
  default?: string;
  options?: string[];
}

export interface FlowiseNode {
  name: string;
  label: string;
  type: string;
  category: string;
  description: string;
  flowiseCategory: string;
  icon?: string;
  inputs: FlowiseNodeInput[];
  credentials?: string[];
  baseClasses?: string[];
  source?: "flowise" | "langflow" | "mastra";
}

export interface N8nTemplateNode {
  id: string;
  type: string;
  name: string;
  position?: [number, number];
}

/** n8n connection format: source node name → { main: [[{ node, type, index }]] } */
export type N8nConnections = Record<string, { main?: Array<Array<{ node: string; type: string; index: number }>> }>;

export interface N8nTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  nodeCount: number;
  nodeTypes: string[];
  nodes?: N8nTemplateNode[];
  connections?: N8nConnections;
}

// Flowise categories mapped to Pilox palette sections
export const FLOWISE_CATEGORY_MAP: Record<string, string> = {
  "Chat Models": "AI / LLM",
  "LLMs": "AI / LLM",
  "Agents": "Agents",
  "Multi Agents": "Agents",
  "Sequential Agents": "Agents",
  "Agent Flows": "Agents",
  "Chains": "Chains",
  "Memory": "Memory",
  "Vector Stores": "Vector Stores",
  "Embeddings": "Embeddings",
  "Tools": "Tools",
  "Retrievers": "Retrievers",
  "Document Loaders": "Document Loaders",
  "Text Splitters": "Text Splitters",
  "Prompts": "Prompts",
  "Moderation": "Moderation",
  "Cache": "Cache",
  "Utilities": "Utilities",
  "Output Parsers": "Output Parsers",
  "Engine": "Engine",
  "Graph": "Graph",
  "Analytic": "Analytic",
  "Record Manager": "Utilities",
  "Response Synthesizer": "Utilities",
  "SpeechToText": "Utilities",
};

/** Get the Pilox palette section for a Flowise category */
export function getPiloxSection(flowiseCategory: string): string {
  return FLOWISE_CATEGORY_MAP[flowiseCategory] ?? flowiseCategory;
}

/** Group Flowise nodes by their Pilox section */
export function groupBySection(nodes: FlowiseNode[]): Record<string, FlowiseNode[]> {
  const groups: Record<string, FlowiseNode[]> = {};
  for (const node of nodes) {
    const section = getPiloxSection(node.category);
    if (!groups[section]) groups[section] = [];
    groups[section].push(node);
  }
  return groups;
}

/** Langflow category → Pilox palette section mapping */
export const LANGFLOW_CATEGORY_MAP: Record<string, string> = {
  openai: "AI / LLM",
  anthropic: "AI / LLM",
  google: "AI / LLM",
  azure: "AI / LLM",
  nvidia: "AI / LLM",
  ollama: "AI / LLM",
  groq: "AI / LLM",
  mistral: "AI / LLM",
  cohere: "AI / LLM",
  huggingface: "AI / LLM",
  agentics: "Agents",
  crewai: "Agents",
  tools: "Tools",
  composio: "Tools",
  processing: "Utilities",
  chroma: "Vector Stores",
  pinecone: "Vector Stores",
  qdrant: "Vector Stores",
  cassandra: "Vector Stores",
  datastax: "Vector Stores",
  weaviate: "Vector Stores",
  langchain_utilities: "Utilities",
  prototypes: "Chains",
  prompts: "Prompts",
};

/** Get Pilox section for a Langflow category */
export function getLangflowSection(category: string): string {
  return LANGFLOW_CATEGORY_MAP[category] ?? category.charAt(0).toUpperCase() + category.slice(1);
}

/** Mastra category → Pilox palette section mapping */
export const MASTRA_CATEGORY_MAP: Record<string, string> = {
  workflow: "Chains",
  agent: "Agents",
  tool: "Tools",
  integration: "Tools",
  harness: "Tools",
  storage: "Vector Stores",
  memory: "Memory",
  voice: "Utilities",
  processor: "Moderation",
  eval: "Utilities",
};

/** Get Pilox section for a Mastra category */
export function getMastraSection(category: string): string {
  return MASTRA_CATEGORY_MAP[category] ?? category.charAt(0).toUpperCase() + category.slice(1);
}

/** Filter nodes by search query */
export function filterFlowiseNodes(nodes: FlowiseNode[], query: string): FlowiseNode[] {
  if (!query.trim()) return nodes;
  const q = query.toLowerCase();
  return nodes.filter(
    (n) =>
      n.label.toLowerCase().includes(q) ||
      n.description.toLowerCase().includes(q) ||
      n.category.toLowerCase().includes(q) ||
      n.name.toLowerCase().includes(q),
  );
}

/** Filter templates by search query or tag */
export function filterTemplates(templates: N8nTemplate[], query: string, tag?: string): N8nTemplate[] {
  let filtered = templates;
  if (tag) {
    filtered = filtered.filter((t) => t.tags.includes(tag));
  }
  if (query.trim()) {
    const q = query.toLowerCase();
    filtered = filtered.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.includes(q)),
    );
  }
  return filtered;
}
