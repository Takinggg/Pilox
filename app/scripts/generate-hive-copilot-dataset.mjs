#!/usr/bin/env node
/**
 * Generates synthetic JSONL from embedded Hive catalogs (Flowise, Langflow, Mastra).
 * Outputs train/val splits for copilot fine-tune / eval.
 *
 * Usage:
 *   node scripts/generate-hive-copilot-dataset.mjs
 *   node scripts/generate-hive-copilot-dataset.mjs --variants 10
 *   node scripts/generate-hive-copilot-dataset.mjs --dry-run --variants 10
 *   node scripts/generate-hive-copilot-dataset.mjs --max-per-source 80
 *   node scripts/generate-hive-copilot-dataset.mjs --variants 10 --pipeline-pairs 400
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cliErr } from "./cli-prefix.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(__dirname, "../..");

const SYSTEM_PROMPT =
  "You are the Hive canvas copilot. Answer with the correct Hive runtime Docker image (hive/*:latest) for imported or composed nodes. Be concise; mention category and ecosystem (Flowise, Langflow, Mastra). If mapping is ambiguous, say hive/generic-agent:latest and ask for review.";

/** Best-effort locale tag for mixed EN/FR synthetic prompts. */
function inferLocaleFromUserContent(userText) {
  if (typeof userText !== "string" || !userText.trim()) return "en";
  if (
    /[àâäéèêëïîôùûüçœ]|(?:\b(?:Quel|Quelle|Quels|Pour | nœud|«|»|quelle image|Hive pour|composant|catégorie|Orchestration)\b)/i.test(
      userText
    )
  )
    return "fr";
  return "en";
}

/** @type {Record<string, string>} — extends app/src/lib/importers/flowise.ts CATEGORY_MAP */
const FLOWISE_CATEGORY_TO_IMAGE = {
  "Chat Models": "hive/llm-agent:latest",
  LLMs: "hive/llm-agent:latest",
  Chains: "hive/llm-chain:latest",
  Agents: "hive/llm-agent:latest",
  "Vector Stores": "hive/rag-agent:latest",
  Embeddings: "hive/embedding-agent:latest",
  Tools: "hive/tool-agent:latest",
  Memory: "hive/memory-agent:latest",
  Retrievers: "hive/rag-agent:latest",
  "Document Loaders": "hive/doc-loader:latest",
  "Text Splitters": "hive/text-processor:latest",
  "Output Parsers": "hive/output-parser:latest",
  Prompts: "hive/prompt-template:latest",
  "Agent Flows": "hive/llm-agent:latest",
  "Multi Agents": "hive/llm-agent:latest",
  "Sequential Agents": "hive/llm-agent:latest",
  Analytic: "hive/llm-agent:latest",
  Cache: "hive/memory-agent:latest",
  Engine: "hive/generic-agent:latest",
  Graph: "hive/llm-chain:latest",
  Moderation: "hive/llm-agent:latest",
  "Record Manager": "hive/text-processor:latest",
  "Response Synthesizer": "hive/rag-agent:latest",
  SpeechToText: "hive/text-processor:latest",
  Utilities: "hive/text-processor:latest",
};

const FLOWISE_SLUG_TO_IMAGE = {
  outputparsers: "hive/output-parser:latest",
  vectorstores: "hive/rag-agent:latest",
  chatmodels: "hive/llm-agent:latest",
  llms: "hive/llm-agent:latest",
  chains: "hive/llm-chain:latest",
  agents: "hive/llm-agent:latest",
  embeddings: "hive/embedding-agent:latest",
  tools: "hive/tool-agent:latest",
  memory: "hive/memory-agent:latest",
  retrievers: "hive/rag-agent:latest",
  documentloaders: "hive/doc-loader:latest",
  textsplitters: "hive/text-processor:latest",
  prompts: "hive/prompt-template:latest",
  agentflow: "hive/llm-agent:latest",
  multiagents: "hive/llm-agent:latest",
  sequentialagents: "hive/llm-agent:latest",
  analytic: "hive/llm-agent:latest",
  cache: "hive/memory-agent:latest",
  engine: "hive/generic-agent:latest",
  graphs: "hive/llm-chain:latest",
  moderation: "hive/llm-agent:latest",
  recordmanager: "hive/text-processor:latest",
  responsesynthesizer: "hive/rag-agent:latest",
  speechtotext: "hive/text-processor:latest",
  utilities: "hive/text-processor:latest",
};

const FLOWISE_NAME_TO_IMAGE = {
  chatOpenAI: "hive/llm-agent:latest",
  chatOllama: "hive/llm-agent:latest",
  chatAnthropic: "hive/llm-agent:latest",
  openAIEmbeddings: "hive/embedding-agent:latest",
  chromaDB: "hive/rag-agent:latest",
  pinecone: "hive/rag-agent:latest",
  conversationChain: "hive/llm-chain:latest",
  conversationalRetrievalQAChain: "hive/rag-agent:latest",
  llmChain: "hive/llm-chain:latest",
  bufferMemory: "hive/memory-agent:latest",
  customTool: "hive/tool-agent:latest",
  serpAPI: "hive/tool-agent:latest",
};

const LANGFLOW_CATEGORY_TO_IMAGE = {
  openai: "hive/llm-agent:latest",
  anthropic: "hive/llm-agent:latest",
  google: "hive/llm-agent:latest",
  azure: "hive/llm-agent:latest",
  nvidia: "hive/llm-agent:latest",
  ollama: "hive/llm-agent:latest",
  groq: "hive/llm-agent:latest",
  mistral: "hive/llm-agent:latest",
  cohere: "hive/llm-agent:latest",
  huggingface: "hive/llm-agent:latest",
  agentics: "hive/llm-agent:latest",
  crewai: "hive/llm-agent:latest",
  tools: "hive/tool-agent:latest",
  composio: "hive/tool-agent:latest",
  processing: "hive/text-processor:latest",
  chroma: "hive/rag-agent:latest",
  pinecone: "hive/rag-agent:latest",
  qdrant: "hive/rag-agent:latest",
  cassandra: "hive/rag-agent:latest",
  datastax: "hive/rag-agent:latest",
  weaviate: "hive/rag-agent:latest",
  langchain_utilities: "hive/text-processor:latest",
  prototypes: "hive/llm-chain:latest",
  prompts: "hive/prompt-template:latest",
};

/** Full Langflow category slug → Hive image (~98 categories). File overrides/extends inline map. */
const LANGFLOW_CATEGORY_MERGED = {
  ...LANGFLOW_CATEGORY_TO_IMAGE,
  ...JSON.parse(fs.readFileSync(path.join(__dirname, "langflow-category-hive-map.json"), "utf8")),
};

const MASTRA_CATEGORY_TO_IMAGE = {
  workflow: "hive/llm-chain:latest",
  agent: "hive/llm-agent:latest",
  tool: "hive/tool-agent:latest",
  integration: "hive/tool-agent:latest",
  harness: "hive/tool-agent:latest",
  storage: "hive/rag-agent:latest",
  memory: "hive/memory-agent:latest",
  voice: "hive/text-processor:latest",
  processor: "hive/text-processor:latest",
  eval: "hive/llm-agent:latest",
};

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function mapFlowiseNode(node) {
  const byName = FLOWISE_NAME_TO_IMAGE[node.name];
  if (byName) return byName;
  const cat = node.category ?? "";
  if (cat && FLOWISE_CATEGORY_TO_IMAGE[cat]) return FLOWISE_CATEGORY_TO_IMAGE[cat];
  const slug = node.flowiseCategory ?? "";
  if (slug && FLOWISE_SLUG_TO_IMAGE[slug]) return FLOWISE_SLUG_TO_IMAGE[slug];
  return "hive/generic-agent:latest";
}

function mapLangflowComponent(c) {
  const cat = (c.category ?? "").toLowerCase();
  return LANGFLOW_CATEGORY_MERGED[cat] ?? "hive/generic-agent:latest";
}

function mapMastraNode(node) {
  const cat = node.category ?? "";
  return MASTRA_CATEGORY_TO_IMAGE[cat] ?? "hive/generic-agent:latest";
}

function truncate(s, n) {
  if (!s || typeof s !== "string") return "";
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

/** Multiple user phrasings per node — same label, different wording & locale */
function pickFlowiseUser(node, label, desc, cat, variant) {
  const d = desc ? truncate(desc, 200) : "";
  const T = [
    () =>
      d
        ? `Flowise: I am wiring the node "${label}" (${node.name}). Description: ${d}. Which Hive runtime image should this map to?`
        : `Flowise: which Hive image for category "${cat}" node "${label}" (${node.name})?`,
    () => `Hive import from Flowise — what Docker image for \`${node.name}\` (“${label}”)?`,
    () =>
      d
        ? `Migrating a Flowise canvas: I have "${label}" (${node.name}). ${d} Target Hive runtime?`
        : `Flowise node \`${node.name}\` (${label}), category ${cat}. Hive image?`,
    () =>
      `Pour Flowise, quelle image Hive pour « ${label} » (\`${node.name}\`) — catégorie ${cat} ?${d ? ` ${d}` : ""}`,
    () => `Short question: Flowise \`${node.name}\` → which \`hive/…:latest\`?`,
    () => `I'm new to Hive: Flowise shows "${label}" (${node.name}). What container should I expect after import?`,
    () =>
      `Enterprise migration — Flowise internal id \`${node.name}\`, display "${label}". Category ${cat}. Map to which Hive image?`,
    () => `Is "${label}" RAG, LLM, or tooling? Flowise name \`${node.name}\`. Pick the matching hive/* image.`,
    () =>
      d
        ? `Debug help: Flowise node ${node.name} says: ${d} … Hive mapping?`
        : `Debug: category ${cat}, node ${node.name}. Hive image?`,
    () =>
      `Quel conteneur \`hive/*\` pour le nœud Flowise « ${label} » (\`${node.name}\`) ? Catégorie : ${cat}.`,
    () => `Flowise JSON references "${node.name}". Label "${label}". What's the Hive runtime equivalent?`,
    () => `One-liner: \`${node.name}\` / ${cat} / Flowise —→ Hive image?`,
  ];
  return T[variant % T.length]();
}

function flowiseAssistant(node, image, cat, variant) {
  const base = `Use \`${image}\` for Flowise node \`${node.name}\` (category: ${cat}).`;
  const tail =
    image === "hive/generic-agent:latest"
      ? [
          "No dedicated Hive mapping — review and assign manually.",
          "Treat as generic in the importer; confirm against your Flowise export.",
          "Fallback container; verify inputs before production.",
        ]
      : [
          "Matches the Hive Flowise import mapping.",
          "This is the expected runtime for that Flowise category.",
          "Aligns with CATEGORY_MAP / slug mapping used on import.",
        ];
  return `${base} ${tail[variant % tail.length]}`;
}

function buildFlowiseExample(node, variant) {
  const image = mapFlowiseNode(node);
  const label = node.label ?? node.name;
  const desc = truncate(node.description ?? "", 240);
  const cat = node.category ?? node.flowiseCategory ?? "unknown";
  const user = pickFlowiseUser(node, label, desc, cat, variant);
  const assistant = flowiseAssistant(node, image, cat, variant);
  return {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: user },
      { role: "assistant", content: assistant },
    ],
    metadata: {
      ecosystem: "flowise",
      flowise_name: node.name,
      flowise_category: cat,
      hive_runtime_images: [image],
      synthetic: true,
      variant,
      locale: inferLocaleFromUserContent(user),
    },
  };
}

function pickLangflowUser(c, label, desc, variant) {
  const d = desc ? truncate(desc, 180) : "";
  const T = [
    () =>
      d
        ? `Langflow: component "${label}" (type ${c.type}, category ${c.category}). ${d} Which Hive image?`
        : `Langflow: which Hive image for "${label}" in category "${c.category}"?`,
    () => `Langflow → Hive: \`${c.name}\` (“${label}”) — docker image?`,
    () =>
      d
        ? `Importing Langflow: ${label} (${c.name}). ${d} Map to hive/*?`
        : `Langflow category ${c.category}, component ${c.name}. Hive runtime?`,
    () => `Pour Langflow, image Hive pour « ${label} » (\`${c.name}\`) — catégorie ${c.category} ?`,
    () => `Quick: Langflow \`${c.name}\` / ${c.category} → ?`,
    () => `Langflow UI shows "${label}". Internal name \`${c.name}\`. Target Hive container?`,
    () => `Multi-agent canvas (Langflow): what is the Hive image for ${c.name}?`,
    () =>
      d
        ? `Langflow docstring: ${d} Component ${c.name}. Hive mapping?`
        : `Langflow ${c.name}: category ${c.category}. Which hive image?`,
    () => `Quelle image pour le composant Langflow « ${label} » ? (name=${c.name})`,
    () => `Langflow export references type ${c.type}, name ${c.name}. Hive equivalent image?`,
    () => `Beginner: "${label}" in Langflow — what runs in Hive?`,
    () => `One-liner: Langflow ${c.category} / ${c.name} —→ Hive?`,
  ];
  return T[variant % T.length]();
}

function langflowAssistant(c, image, variant) {
  const base = `Use \`${image}\` for Langflow component "${c.name}" (category: ${c.category}).`;
  if (image === "hive/generic-agent:latest") {
    const tails = [
      "Category is not in the default Langflow→Hive map — use generic or extend mapping.",
      "No default mapping; keep as hive/generic-agent:latest until you classify it.",
      "Fallback: confirm component role (LLM vs RAG vs tool) then reassign.",
    ];
    return `${base} ${tails[variant % tails.length]}`;
  }
  const tails = [
    "Standard Langflow→Hive mapping applies.",
    "This category maps cleanly to that Hive runtime.",
    "",
  ];
  const t = tails[variant % tails.length];
  return t ? `${base} ${t}` : base;
}

function buildLangflowExample(c, variant) {
  const image = mapLangflowComponent(c);
  const label = c.label ?? c.name;
  const desc = truncate(c.description ?? "", 220);
  const user = pickLangflowUser(c, label, desc, variant);
  const assistant = langflowAssistant(c, image, variant);
  return {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: user },
      { role: "assistant", content: assistant.trim() },
    ],
    metadata: {
      ecosystem: "langflow",
      langflow_name: c.name,
      langflow_category: c.category,
      hive_runtime_images: [image],
      synthetic: true,
      variant,
      locale: inferLocaleFromUserContent(user),
    },
  };
}

function pickMastraUser(node, label, desc, cat, variant) {
  const d = desc ? truncate(desc, 220) : "";
  const T = [
    () =>
      d
        ? `Mastra: I need the node "${label}" (${node.type}). ${d} Map to which Hive runtime image?`
        : `Mastra: which Hive image for "${label}" (category ${cat})?`,
    () => `Mastra workflow primitive \`${node.name}\` (“${label}”) — Hive docker image?`,
    () =>
      d
        ? `Building in Mastra: ${label}. ${d} What hive/* container?`
        : `Mastra category ${cat}, node ${node.name}. Hive mapping?`,
    () => `Mastra → Hive : pour « ${label} » (\`${node.name}\`), quelle image ?`,
    () => `Short: Mastra \`${node.name}\` / ${cat} → ?`,
    () => `Orchestration step "${label}" in Mastra (${node.type}). Target Hive runtime?`,
    () => `Agent network uses Mastra node ${node.name}. Which Hive image fits?`,
    () =>
      d
        ? `Spec: ${d} (Mastra ${node.name}). Hive?`
        : `Mastra ${node.name}, type ${node.type}. Hive image?`,
    () => `Quel runtime Hive pour le nœud Mastra « ${label} » ?`,
    () => `Mastra export: ${node.name}. Map to hive agent family.`,
    () => `Workflow DSL: "${label}" — Hive container?`,
    () => `One-liner: Mastra ${cat} / ${node.name} —→ Hive?`,
  ];
  return T[variant % T.length]();
}

function mastraAssistant(node, image, cat, variant) {
  const base = `Use \`${image}\` for Mastra node \`${node.name}\` (category: ${cat}).`;
  const tails = [
    "Mastra primitives map to Hive chains, LLM agents, tools, or RAG by category.",
    "Category drives the Hive runtime (workflow→chain, agent→llm, tool→tool, …).",
    "Same mapping rule as MASTRA_CATEGORY_MAP in Hive.",
  ];
  return `${base} ${tails[variant % tails.length]}`;
}

function buildMastraExample(node, variant) {
  const image = mapMastraNode(node);
  const label = node.label ?? node.name;
  const desc = truncate(node.description ?? "", 260);
  const cat = node.category ?? "unknown";
  const user = pickMastraUser(node, label, desc, cat, variant);
  const assistant = mastraAssistant(node, image, cat, variant);
  return {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: user },
      { role: "assistant", content: assistant },
    ],
    metadata: {
      ecosystem: "mastra",
      mastra_name: node.name,
      mastra_category: cat,
      hive_runtime_images: [image],
      synthetic: true,
      variant,
      locale: inferLocaleFromUserContent(user),
    },
  };
}

function buildFlowisePair(nodeA, nodeB, idx) {
  const imgA = mapFlowiseNode(nodeA);
  const imgB = mapFlowiseNode(nodeB);
  const la = nodeA.label ?? nodeA.name;
  const lb = nodeB.label ?? nodeB.name;
  const user = `Flowise pipeline (order): first "${la}" (\`${nodeA.name}\`) then "${lb}" (\`${nodeB.name}\`). Which Hive images in sequence?`;
  const assistant = `Step 1 → \`${imgA}\` for \`${nodeA.name}\`. Step 2 → \`${imgB}\` for \`${nodeB.name}\`. Connect pipeline edges so outputs of step 1 feed step 2 where applicable.`;
  return {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: user },
      { role: "assistant", content: assistant },
    ],
    metadata: {
      ecosystem: "flowise",
      pair_key: `flowise:pair:${idx}`,
      pair_index: idx,
      kind: "pipeline_pair",
      hive_runtime_images: [imgA, imgB],
      synthetic: true,
      locale: inferLocaleFromUserContent(user),
    },
  };
}

function buildLangflowPair(cA, cB, idx) {
  const imgA = mapLangflowComponent(cA);
  const imgB = mapLangflowComponent(cB);
  const la = cA.label ?? cA.name;
  const lb = cB.label ?? cB.name;
  const user = `Langflow chain: ${la} (${cA.name}) → ${lb} (${cB.name}). Hive runtime images in order?`;
  const assistant = `First \`${imgA}\` for "${cA.name}", then \`${imgB}\` for "${cB.name}". Validate handles match output/input types between components.`;
  return {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: user },
      { role: "assistant", content: assistant },
    ],
    metadata: {
      ecosystem: "langflow",
      pair_key: `langflow:pair:${idx}`,
      pair_index: idx,
      kind: "pipeline_pair",
      hive_runtime_images: [imgA, imgB],
      synthetic: true,
      locale: inferLocaleFromUserContent(user),
    },
  };
}

function buildMastraPair(nodeA, nodeB, idx) {
  const imgA = mapMastraNode(nodeA);
  const imgB = mapMastraNode(nodeB);
  const la = nodeA.label ?? nodeA.name;
  const lb = nodeB.label ?? nodeB.name;
  const user = `Mastra workflow: step "${la}" then "${lb}". Which Hive images?`;
  const assistant = `First \`${imgA}\` for \`${nodeA.name}\`, then \`${imgB}\` for \`${nodeB.name}\`. Merge state between steps per Mastra workflow semantics.`;
  return {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: user },
      { role: "assistant", content: assistant },
    ],
    metadata: {
      ecosystem: "mastra",
      pair_key: `mastra:pair:${idx}`,
      pair_index: idx,
      kind: "pipeline_pair",
      hive_runtime_images: [imgA, imgB],
      synthetic: true,
      locale: inferLocaleFromUserContent(user),
    },
  };
}

function splitKey(record) {
  const m = record.metadata;
  if (m.pair_key) return m.pair_key;
  return `${m.ecosystem}:${m.flowise_name ?? m.langflow_name ?? m.mastra_name}`;
}

function parseArgs(argv) {
  let dryRun = false;
  let maxPerSource = Infinity;
  let variants = 1;
  let pipelinePairs = 0;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--dry-run") dryRun = true;
    if (argv[i] === "--max-per-source" && argv[i + 1]) {
      maxPerSource = parseInt(argv[++i], 10);
      if (Number.isNaN(maxPerSource)) maxPerSource = Infinity;
    }
    if (argv[i] === "--variants" && argv[i + 1]) {
      variants = parseInt(argv[++i], 10);
      if (Number.isNaN(variants) || variants < 1) variants = 1;
      if (variants > 50) variants = 50;
    }
    if (argv[i] === "--pipeline-pairs" && argv[i + 1]) {
      pipelinePairs = parseInt(argv[++i], 10);
      if (Number.isNaN(pipelinePairs) || pipelinePairs < 0) pipelinePairs = 0;
      if (pipelinePairs > 5000) pipelinePairs = 5000;
    }
  }
  return { dryRun, maxPerSource, variants, pipelinePairs };
}

function main() {
  const { dryRun, maxPerSource, variants, pipelinePairs } = parseArgs(process.argv);

  const flowisePath = path.join(APP_ROOT, "src/lib/flowise-node-catalog.json");
  const langflowPath = path.join(APP_ROOT, "src/lib/langflow-component-catalog.json");
  const mastraPath = path.join(APP_ROOT, "src/lib/mastra-node-catalog.json");

  const flowise = JSON.parse(fs.readFileSync(flowisePath, "utf8"));
  const langflow = JSON.parse(fs.readFileSync(langflowPath, "utf8"));
  const mastra = JSON.parse(fs.readFileSync(mastraPath, "utf8"));

  const train = [];
  const val = [];

  /** Same node / same pair id → same split for all variants (avoid train/val leakage) */
  function pushSplit(record) {
    const key = splitKey(record);
    const isVal = hashStr(key) % 10 === 0;
    if (isVal) val.push(record);
    else train.push(record);
  }

  let fi = 0;
  for (const node of flowise) {
    if (fi >= maxPerSource) break;
    for (let v = 0; v < variants; v++) pushSplit(buildFlowiseExample(node, v));
    fi++;
  }

  let li = 0;
  for (const c of langflow) {
    if (li >= maxPerSource) break;
    for (let v = 0; v < variants; v++) pushSplit(buildLangflowExample(c, v));
    li++;
  }

  let mi = 0;
  for (const node of mastra) {
    if (mi >= maxPerSource) break;
    for (let v = 0; v < variants; v++) pushSplit(buildMastraExample(node, v));
    mi++;
  }

  const nFlow = Math.min(flowise.length, fi || flowise.length);
  const nLang = Math.min(langflow.length, li || langflow.length);
  const nMas = Math.min(mastra.length, mi || mastra.length);
  const pf = Math.min(pipelinePairs, Math.max(0, nFlow - 1));
  const pl = Math.min(pipelinePairs, Math.max(0, nLang - 1));
  const pm = Math.min(pipelinePairs, Math.max(0, nMas - 1));

  for (let i = 0; i < pf; i++) {
    pushSplit(buildFlowisePair(flowise[i], flowise[(i + 1) % nFlow], i));
  }
  for (let i = 0; i < pl; i++) {
    pushSplit(buildLangflowPair(langflow[i], langflow[(i + 1) % nLang], i));
  }
  for (let i = 0; i < pm; i++) {
    pushSplit(buildMastraPair(mastra[i], mastra[(i + 1) % nMas], i));
  }

  const outDir = path.join(REPO_ROOT, "datasets/hive-copilot-v1/splits");
  if (!dryRun) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, "synthetic-train.jsonl"),
      train.map((r) => JSON.stringify(r)).join("\n") + "\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(outDir, "synthetic-val.jsonl"),
      val.map((r) => JSON.stringify(r)).join("\n") + "\n",
      "utf8"
    );
  }

  const summary = {
    flowise_nodes: fi,
    langflow_nodes: li,
    mastra_nodes: mi,
    variants_per_node: variants,
    pipeline_pairs_per_ecosystem: { flowise: pf, langflow: pl, mastra: pm },
    total_rows: train.length + val.length,
    train_lines: train.length,
    val_lines: val.length,
    out_train: path.join(outDir, "synthetic-train.jsonl"),
    out_val: path.join(outDir, "synthetic-val.jsonl"),
    dryRun,
  };

  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (e) {
  cliErr("generate-hive-copilot-dataset:", e instanceof Error ? e.message : e);
  process.exit(1);
}
