#!/usr/bin/env node
/**
 * Merges hand-written gold train + synthetic train into one JSONL (optional shuffle).
 *
 * Usage:
 *   node scripts/merge-hive-copilot-train.mjs
 *   node scripts/merge-hive-copilot-train.mjs --shuffle
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cliErr } from "./cli-prefix.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const DATA = path.join(REPO_ROOT, "datasets/hive-copilot-v1/splits");

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function main() {
  const shuffleFlag = process.argv.includes("--shuffle");

  const gold = fs.readFileSync(path.join(DATA, "train.jsonl"), "utf8").trim().split("\n").filter(Boolean);
  const syn = fs.readFileSync(path.join(DATA, "synthetic-train.jsonl"), "utf8").trim().split("\n").filter(Boolean);
  const pubPath = path.join(DATA, "public-sources-train.jsonl");
  const pub = fs.existsSync(pubPath)
    ? fs.readFileSync(pubPath, "utf8").trim().split("\n").filter(Boolean)
    : [];

  const enrichedPath = path.join(DATA, "gold-enriched-v2.jsonl");
  const enriched = fs.existsSync(enrichedPath)
    ? fs.readFileSync(enrichedPath, "utf8").trim().split("\n").filter(Boolean)
    : [];

  let lines = [...gold, ...enriched, ...syn, ...pub];
  if (shuffleFlag) lines = shuffle(lines);

  const out = path.join(DATA, "combined-train.jsonl");
  fs.writeFileSync(out, lines.join("\n") + "\n", "utf8");

  console.log(
    JSON.stringify(
      {
        gold_lines: gold.length,
        enriched_v2_lines: enriched.length,
        synthetic_lines: syn.length,
        public_lines: pub.length,
        combined_lines: lines.length,
        shuffle: shuffleFlag,
        out,
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (e) {
  cliErr("merge-hive-copilot-train:", e instanceof Error ? e.message : e);
  process.exit(1);
}
