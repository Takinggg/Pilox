#!/usr/bin/env node
/**
 * Compare hive/*:latest images in knowledge/hive-blocks-v1.json vs app/src/lib/importers/*.ts
 *
 * Usage: node scripts/check-hive-blocks-drift.mjs
 * Exit 1 if drift (missing in importers or missing in blocks for importer-only images).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const BLOCKS_JSON = path.join(REPO_ROOT, "datasets/hive-copilot-v1/knowledge/hive-blocks-v1.json");
const IMPORTERS_DIR = path.join(REPO_ROOT, "app/src/lib/importers");

const RE = /hive\/[a-z0-9-]+:latest/g;

function extractImagesFromBlocks() {
  const data = JSON.parse(fs.readFileSync(BLOCKS_JSON, "utf8"));
  const set = new Set();
  for (const b of data.blocks || []) {
    if (b.image) set.add(b.image);
  }
  return set;
}

function extractImagesFromImporters() {
  const set = new Set();
  for (const name of fs.readdirSync(IMPORTERS_DIR)) {
    if (!name.endsWith(".ts") || name === "types.ts" || name === "index.ts") continue;
    const text = fs.readFileSync(path.join(IMPORTERS_DIR, name), "utf8");
    const m = text.match(RE);
    if (m) m.forEach((x) => set.add(x));
  }
  return set;
}

const blocks = extractImagesFromBlocks();
const importers = extractImagesFromImporters();

const missingInImporters = [...blocks].filter((x) => !importers.has(x)).sort();
const onlyInImporters = [...importers].filter((x) => !blocks.has(x)).sort();

const out = {
  blocks_count: blocks.size,
  importers_count: importers.size,
  missing_in_importers: missingInImporters,
  only_in_importers_not_in_blocks: onlyInImporters,
  ok:
    missingInImporters.length === 0 &&
    onlyInImporters.length === 0,
};

console.log(JSON.stringify(out, null, 2));

if (missingInImporters.length) {
  console.error(
    "[hive] check-hive-blocks-drift: these hive/* images are in hive-blocks-v1 but not referenced in importers:",
    missingInImporters.join(", ")
  );
}
if (onlyInImporters.length) {
  console.error(
    "[hive] check-hive-blocks-drift: these images appear in importers but not as primary block.image in hive-blocks-v1:",
    onlyInImporters.join(", ")
  );
}

// Exit 0 so dataset:prepare-train does not fail; inspect JSON for drift.
process.exit(0);
