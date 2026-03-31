#!/usr/bin/env node
/**
 * Extract AI-relevant n8n workflow templates and convert to Hive format.
 *
 * Usage: node scripts/extract-n8n-templates.mjs
 * Requires: npm run dataset:download-n8n-community (JSON under datasets/.../n8n-community-workflows)
 * Override: N8N_TEMPLATES_DIR=/path/to/json
 */

import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { cliErr } from "./cli-prefix.mjs";

const APP_ROOT = join(import.meta.dirname, "..");
const REPO_ROOT = join(APP_ROOT, "..");
const DEFAULT_N8N_DIR = join(
  REPO_ROOT,
  "datasets",
  "hive-copilot-v1",
  "external",
  "n8n-community-workflows",
);
const N8N_BASE = process.env.N8N_TEMPLATES_DIR ?? DEFAULT_N8N_DIR;
const OUTPUT = join(APP_ROOT, "src", "lib", "n8n-workflow-templates.json");

// Node types that indicate AI-relevant workflows
const AI_NODE_TYPES = new Set([
  "@n8n/n8n-nodes-langchain.agent",
  "@n8n/n8n-nodes-langchain.chainLlm",
  "@n8n/n8n-nodes-langchain.chainSummarization",
  "@n8n/n8n-nodes-langchain.chainRetrievalQa",
  "@n8n/n8n-nodes-langchain.lmChatOpenAi",
  "@n8n/n8n-nodes-langchain.lmChatAnthropic",
  "@n8n/n8n-nodes-langchain.lmChatOllama",
  "@n8n/n8n-nodes-langchain.lmChatGoogleGemini",
  "@n8n/n8n-nodes-langchain.lmOpenAi",
  "@n8n/n8n-nodes-langchain.memoryBufferWindow",
  "@n8n/n8n-nodes-langchain.memoryVectorStore",
  "@n8n/n8n-nodes-langchain.vectorStoreInMemory",
  "@n8n/n8n-nodes-langchain.vectorStorePinecone",
  "@n8n/n8n-nodes-langchain.vectorStoreQdrant",
  "@n8n/n8n-nodes-langchain.embeddingsOpenAi",
  "@n8n/n8n-nodes-langchain.toolCode",
  "@n8n/n8n-nodes-langchain.toolWorkflow",
  "@n8n/n8n-nodes-langchain.toolHttpRequest",
  "@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter",
  "@n8n/n8n-nodes-langchain.outputParserStructured",
  "@n8n/n8n-nodes-langchain.documentDefaultDataLoader",
  "n8n-nodes-base.openAi",
]);

// Also match partial patterns
const AI_PATTERNS = [
  "langchain", "openai", "anthropic", "ollama", "gemini",
  "agent", "llm", "embedding", "vector", "memory", "rag",
  "chatbot", "ai", "gpt",
];

function isAiRelevant(workflow) {
  // Check node types
  const nodes = workflow.nodes ?? [];
  for (const n of nodes) {
    const type = (n.type ?? "").toLowerCase();
    if (AI_NODE_TYPES.has(n.type)) return true;
    if (AI_PATTERNS.some(p => type.includes(p))) return true;
  }
  // Check workflow name
  const name = (workflow.name ?? "").toLowerCase();
  if (AI_PATTERNS.some(p => name.includes(p))) return true;
  return false;
}

function extractTemplate(workflow, fileName) {
  const nodes = (workflow.nodes ?? []).filter(n => n.type !== "n8n-nodes-base.stickyNote");
  return {
    id: fileName.replace(".json", ""),
    name: workflow.name ?? fileName,
    description: extractDescription(workflow),
    tags: extractTags(workflow),
    nodeCount: nodes.length,
    nodeTypes: [...new Set(nodes.map(n => n.type))],
    nodes: nodes.map(n => ({
      id: n.id,
      type: n.type,
      name: n.name,
      position: n.position ? [Math.round(n.position[0]), Math.round(n.position[1])] : undefined,
    })),
    connections: simplifyConnections(workflow.connections),
  };
}

function extractDescription(wf) {
  // Try to extract from sticky notes
  const stickies = (wf.nodes ?? []).filter(n => n.type === "n8n-nodes-base.stickyNote");
  for (const s of stickies) {
    const content = s.parameters?.content ?? "";
    if (content.length > 20 && content.length < 500) return content.slice(0, 200);
  }
  return "";
}

function extractTags(wf) {
  const tags = new Set();
  const name = (wf.name ?? "").toLowerCase();
  const nodes = wf.nodes ?? [];

  if (name.includes("chatbot") || name.includes("chat")) tags.add("chatbot");
  if (name.includes("rag") || nodes.some(n => (n.type??"").includes("vectorStore"))) tags.add("rag");
  if (name.includes("agent") || nodes.some(n => (n.type??"").includes("agent"))) tags.add("agent");
  if (nodes.some(n => (n.type??"").includes("memory"))) tags.add("memory");
  if (nodes.some(n => (n.type??"").includes("openAi") || (n.type??"").includes("OpenAi"))) tags.add("openai");
  if (nodes.some(n => (n.type??"").includes("anthropic") || (n.type??"").includes("Anthropic"))) tags.add("anthropic");
  if (nodes.some(n => (n.type??"").includes("ollama") || (n.type??"").includes("Ollama"))) tags.add("ollama");
  if (name.includes("seo") || name.includes("content")) tags.add("content");
  if (name.includes("email") || name.includes("gmail")) tags.add("email");
  if (name.includes("slack") || name.includes("discord")) tags.add("messaging");
  if (name.includes("pdf") || name.includes("document")) tags.add("documents");
  if (name.includes("summariz")) tags.add("summarization");

  return [...tags];
}

function simplifyParams(params) {
  if (!params) return {};
  const simplified = {};
  for (const [key, val] of Object.entries(params)) {
    if (typeof val === "string" && val.length > 500) {
      simplified[key] = val.slice(0, 200) + "...";
    } else if (typeof val !== "object") {
      simplified[key] = val;
    } else if (val && typeof val === "object" && !Array.isArray(val)) {
      // Keep simple nested objects
      simplified[key] = val;
    }
  }
  return simplified;
}

function simplifyConnections(conns) {
  if (!conns) return {};
  const simplified = {};
  for (const [source, targets] of Object.entries(conns)) {
    simplified[source] = targets;
  }
  return simplified;
}

async function findJsonFiles(dir) {
  const results = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...await findJsonFiles(full));
      } else if (entry.name.endsWith(".json") && entry.name !== "download-manifest.json") {
        results.push(full);
      }
    }
  } catch { /* skip */ }
  return results;
}

async function main() {
  const files = await findJsonFiles(N8N_BASE);
  console.log(`Found ${files.length} JSON files`);

  const templates = [];
  let processed = 0;
  let aiRelevant = 0;

  for (const file of files) {
    try {
      const raw = await readFile(file, "utf-8");
      const payload = JSON.parse(raw);
      const wf =
        payload &&
        typeof payload.workflow === "object" &&
        payload.workflow !== null &&
        Array.isArray(payload.workflow.nodes)
          ? payload.workflow
          : payload;
      processed++;

      if (!wf.nodes || !Array.isArray(wf.nodes)) continue;
      if (!isAiRelevant(wf)) continue;

      aiRelevant++;
      templates.push(extractTemplate(wf, file.split(/[/\\]/).pop()));
    } catch {
      // Skip invalid JSON
    }
  }

  // Sort by AI-relevance score (prefer templates with more AI nodes and fewer total nodes)
  templates.sort((a, b) => {
    const aiScore = (t) => {
      const aiNodes = t.nodeTypes.filter(nt => AI_PATTERNS.some(p => nt.toLowerCase().includes(p)));
      return aiNodes.length * 10 - Math.max(0, t.nodeCount - 15); // penalize very large workflows
    };
    return aiScore(b) - aiScore(a);
  });

  // Take top 75, cap each at 25 nodes to keep file size reasonable
  const top = templates.slice(0, 75).map(t => {
    if (t.nodes.length > 25) {
      t.nodes = t.nodes.slice(0, 25);
      t.nodeCount = 25;
    }
    return t;
  });

  console.log(`Processed ${processed} workflows, ${aiRelevant} AI-relevant, keeping top ${top.length}`);
  console.log("Tags:", [...new Set(top.flatMap(t => t.tags))].join(", "));

  await writeFile(OUTPUT, JSON.stringify(top));
  console.log(`Written to ${OUTPUT}`);
}

main().catch((e) => {
  cliErr("extract-n8n-templates:", e instanceof Error ? e.message : e);
  process.exit(1);
});
