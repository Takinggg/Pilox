#!/usr/bin/env node
/**
 * Baseline report for golden-eval.jsonl: structure, hive image mentions, optional ```json``` canvas parse.
 *
 * Usage: node scripts/eval-golden-copilot.mjs
 * Output: datasets/hive-copilot-v1/reports/golden-eval-baseline.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cliErr } from "./cli-prefix.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const GOLD = path.join(REPO_ROOT, "datasets/hive-copilot-v1/splits/golden-eval.jsonl");
const REPORT_DIR = path.join(REPO_ROOT, "datasets/hive-copilot-v1/reports");
const OUT = path.join(REPORT_DIR, "golden-eval-baseline.json");

const HIVE_IMG = /hive\/[a-z0-9-]+:latest/g;

function extractJsonBlocks(text) {
  const out = [];
  const re = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[1].trim();
    try {
      out.push(JSON.parse(raw));
    } catch {
      out.push(null);
    }
  }
  return out;
}

function validateCanvasLoose(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (obj.pipeline && !Array.isArray(obj.pipeline)) return false;
  if (obj.pipeline) {
    for (const p of obj.pipeline) {
      if (p.image && !/^hive\/[a-z0-9-]+:latest$/.test(p.image)) return false;
    }
  }
  return true;
}

function main() {
  const lines = fs.readFileSync(GOLD, "utf8").trim().split("\n").filter(Boolean);
  const rows = [];
  let ok = 0;
  let withHiveMention = 0;
  let withValidOptionalJson = 0;

  for (const line of lines) {
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      rows.push({ error: "invalid_json", snippet: line.slice(0, 120) });
      continue;
    }
    ok++;
    const msgs = rec.messages;
    if (!Array.isArray(msgs) || msgs.length < 2) {
      rows.push({ error: "bad_messages", eval_id: rec.metadata?.eval_id });
      continue;
    }
    const assistant = msgs.filter((m) => m.role === "assistant").pop()?.content ?? "";
    const mentions = assistant.match(HIVE_IMG) || [];
    if (mentions.length) withHiveMention++;
    const jsonBlocks = extractJsonBlocks(assistant);
    const validJson = jsonBlocks.some((j) => j && validateCanvasLoose(j));
    if (validJson) withValidOptionalJson++;

    rows.push({
      eval_id: rec.metadata?.eval_id,
      assistant_hive_images_found: [...new Set(mentions)],
      optional_json_blocks: jsonBlocks.length,
      optional_json_valid_loose: validJson,
    });
  }

  const summary = {
    generated_at: new Date().toISOString(),
    golden_eval_lines: lines.length,
    parse_ok: ok,
    lines_with_assistant_hive_mention: withHiveMention,
    lines_with_valid_loose_canvas_json: withValidOptionalJson,
    note:
      "This is a structural baseline, not model quality. Re-run after training to compare.",
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const payload = { summary, per_line: rows };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf8");
  console.log(JSON.stringify({ ...summary, report: OUT }, null, 2));
}

try {
  main();
} catch (e) {
  cliErr("eval-golden-copilot:", e instanceof Error ? e.message : e);
  process.exit(1);
}
