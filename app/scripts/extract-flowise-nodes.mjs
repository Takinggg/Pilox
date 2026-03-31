#!/usr/bin/env node
/**
 * Extract Flowise INode definitions from .ts source files.
 * Produces a JSON catalog of all node types with their metadata and inputs.
 *
 * Usage: node scripts/extract-flowise-nodes.mjs
 */

import { readdir, readFile, writeFile, stat } from "fs/promises";
import { join, basename } from "path";
import { cliErr } from "./cli-prefix.mjs";

const FLOWISE_NODES = process.env.TEMP
  ? join(process.env.TEMP, "flowise-clone", "packages", "components", "nodes")
  : "/tmp/flowise-clone/packages/components/nodes";
const OUTPUT = join(import.meta.dirname, "..", "src", "lib", "flowise-node-catalog.json");

// Categories to include (AI-relevant)
const INCLUDE_CATEGORIES = new Set([
  "chatmodels", "llms", "agents", "chains", "memory", "vectorstores",
  "embeddings", "tools", "retrievers", "documentloaders", "textsplitters",
  "prompts", "outputparsers", "moderation", "cache", "multiagents",
  "sequentialagents", "agentflow", "graphs", "speechtotext", "engine",
  "utilities", "analytic", "recordmanager", "responsesynthesizer",
]);

/** Parse a Flowise .ts node file and extract metadata. */
function extractNodeFromSource(source, filePath) {
  const node = {};

  // Extract this.label = '...'
  const labelMatch = source.match(/this\.label\s*=\s*['"`]([^'"`]+)['"`]/);
  if (labelMatch) node.label = labelMatch[1];

  // Extract this.name = '...'
  const nameMatch = source.match(/this\.name\s*=\s*['"`]([^'"`]+)['"`]/);
  if (nameMatch) node.name = nameMatch[1];

  // Extract this.type = '...'
  const typeMatch = source.match(/this\.type\s*=\s*['"`]([^'"`]+)['"`]/);
  if (typeMatch) node.type = typeMatch[1];

  // Extract this.category = '...'
  const catMatch = source.match(/this\.category\s*=\s*['"`]([^'"`]+)['"`]/);
  if (catMatch) node.category = catMatch[1];

  // Extract this.description = '...'
  const descMatch = source.match(/this\.description\s*=\s*['"`]([^'"`]+)['"`]/);
  if (descMatch) node.description = descMatch[1];

  // Extract this.icon = '...'
  const iconMatch = source.match(/this\.icon\s*=\s*['"`]([^'"`]+)['"`]/);
  if (iconMatch) node.icon = iconMatch[1];

  // Extract this.version
  const verMatch = source.match(/this\.version\s*=\s*([\d.]+)/);
  if (verMatch) node.version = parseFloat(verMatch[1]);

  // Extract inputs array
  const inputs = [];
  // Match each input object in this.inputs = [...]
  const inputsSection = source.match(/this\.inputs\s*=\s*\[([\s\S]*?)(?:\]\s*(?:this\.|}))/);
  if (inputsSection) {
    const inputBlock = inputsSection[1];
    // Parse individual input objects
    const inputRegex = /\{\s*(?:label:\s*['"`]([^'"`]*)['"`])?[\s\S]*?name:\s*['"`]([^'"`]*)['"`][\s\S]*?type:\s*['"`]([^'"`]*)['"`][\s\S]*?(?:default:\s*([^,}\n]+?))?[\s\S]*?(?:optional:\s*(true|false))?\s*(?:,\s*additionalParams:\s*(true|false))?\s*\}/g;
    // Simpler regex: extract label, name, type for each input
    const simpleInputRegex = /label:\s*['"`]([^'"`]+)['"`][\s\S]*?name:\s*['"`]([^'"`]+)['"`][\s\S]*?type:\s*['"`]([^'"`]+)['"`]/g;
    let m;
    while ((m = simpleInputRegex.exec(inputBlock)) !== null) {
      const input = { label: m[1], name: m[2], type: m[3] };
      // Check for default
      const afterType = inputBlock.slice(m.index + m[0].length, m.index + m[0].length + 200);
      const defMatch = afterType.match(/default:\s*(['"`]([^'"`]*?)['"`]|(\d+\.?\d*)|true|false)/);
      if (defMatch) input.default = defMatch[2] ?? defMatch[3] ?? defMatch[0].replace("default:", "").trim();
      // Check for optional
      const optMatch = afterType.match(/optional:\s*(true|false)/);
      if (optMatch) input.optional = optMatch[1] === "true";
      // Check for options array
      const optionsMatch = inputBlock.slice(m.index, m.index + 500).match(/options:\s*\[([^\]]*)\]/);
      if (optionsMatch) {
        const opts = [...optionsMatch[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map(x => x[1]);
        if (opts.length > 0) input.options = opts;
      }
      inputs.push(input);
    }
  }
  node.inputs = inputs;

  // Extract baseClasses
  const baseMatch = source.match(/this\.baseClasses\s*=\s*\[([^\]]*)\]/);
  if (baseMatch) {
    const classes = [...baseMatch[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map(x => x[1]);
    if (classes.length > 0) node.baseClasses = classes;
  }

  // Extract credential info
  const credMatch = source.match(/credentialNames:\s*\[([^\]]*)\]/);
  if (credMatch) {
    node.credentials = [...credMatch[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map(x => x[1]);
  }

  node.sourcePath = filePath;
  return node;
}

async function main() {
  const categories = await readdir(FLOWISE_NODES);
  const catalog = [];

  for (const cat of categories) {
    if (!INCLUDE_CATEGORIES.has(cat)) continue;
    const catPath = join(FLOWISE_NODES, cat);
    const catStat = await stat(catPath).catch(() => null);
    if (!catStat?.isDirectory()) continue;

    const nodes = await readdir(catPath);
    for (const nodeName of nodes) {
      const nodePath = join(catPath, nodeName);
      const nodeStat = await stat(nodePath).catch(() => null);
      if (!nodeStat?.isDirectory()) continue;

      // Find main .ts file
      const files = await readdir(nodePath);
      const mainFile = files.find(f => f.endsWith(".ts") && !f.startsWith("Flowise") && !f.endsWith(".d.ts") && f !== "index.ts")
        || files.find(f => f.endsWith(".ts") && !f.endsWith(".d.ts"));
      if (!mainFile) continue;

      try {
        const source = await readFile(join(nodePath, mainFile), "utf-8");
        const node = extractNodeFromSource(source, `${cat}/${nodeName}/${mainFile}`);
        if (node.name && node.label) {
          node.flowiseCategory = cat;
          catalog.push(node);
        }
      } catch (err) {
        // Skip files that fail to read
      }
    }
  }

  // Sort by category then name
  catalog.sort((a, b) => (a.category ?? "").localeCompare(b.category ?? "") || (a.label ?? "").localeCompare(b.label ?? ""));

  console.log(`Extracted ${catalog.length} nodes from Flowise`);
  console.log("Categories:", [...new Set(catalog.map(n => n.category))].join(", "));

  await writeFile(OUTPUT, JSON.stringify(catalog, null, 2));
  console.log(`Written to ${OUTPUT}`);
}

main().catch((e) => {
  cliErr("extract-flowise-nodes:", e instanceof Error ? e.message : e);
  process.exit(1);
});
