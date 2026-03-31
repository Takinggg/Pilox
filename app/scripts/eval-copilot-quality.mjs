#!/usr/bin/env node
/**
 * Product-style eval on golden-eval (or any JSONL): canonical hive images + canvas-response schema.
 *
 * Usage: node scripts/eval-copilot-quality.mjs
 *        node scripts/eval-copilot-quality.mjs --file path/to.jsonl
 *
 * Output: datasets/hive-copilot-v1/reports/golden-eval-quality.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import { cliErr } from "./cli-prefix.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const DATA = path.join(REPO_ROOT, "datasets/hive-copilot-v1");
const GOLD = path.join(DATA, "splits/golden-eval.jsonl");
const CANON = path.join(DATA, "canonical/hive-runtime-images.json");
const SCHEMA_PATH = path.join(DATA, "schema/canvas-response.schema.json");
const REPORT_DIR = path.join(DATA, "reports");
const OUT = path.join(REPORT_DIR, "golden-eval-quality.json");

const HIVE_IMG = /\bhive\/[a-z0-9-]+:latest\b/g;

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

function parseArgs(argv) {
  let file = GOLD;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--file" && argv[i + 1]) file = path.resolve(argv[++i]);
  }
  return { file };
}

function main() {
  const { file } = parseArgs(process.argv);

  const canonical = JSON.parse(fs.readFileSync(CANON, "utf8"));
  const allowed = new Set(canonical.images.map((x) => x.image));

  const schemaRaw = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
  delete schemaRaw.$schema;
  delete schemaRaw.$id;
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validateCanvas = ajv.compile(schemaRaw);

  const raw = fs.readFileSync(file, "utf8").trim();
  const lines = raw ? raw.split("\n").filter(Boolean) : [];

  const perLine = [];
  let parseOk = 0;
  let linesWithHiveMention = 0;
  let linesAllCanonical = 0;
  let linesWithSchemaValidBlock = 0;
  let unknownImageLines = 0;

  for (const line of lines) {
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      perLine.push({ error: "invalid_json" });
      continue;
    }
    parseOk++;
    const msgs = rec.messages;
    if (!Array.isArray(msgs)) {
      perLine.push({ error: "bad_messages", eval_id: rec.metadata?.eval_id });
      continue;
    }
    const assistant = msgs.filter((m) => m.role === "assistant").pop()?.content ?? "";
    const mentions = assistant.match(HIVE_IMG) || [];
    const unique = [...new Set(mentions)];
    if (unique.length) linesWithHiveMention++;

    const unknown = unique.filter((img) => !allowed.has(img));
    if (unknown.length) unknownImageLines++;
    const allCanonical = unique.length > 0 && unknown.length === 0;
    if (allCanonical) linesAllCanonical++;

    const jsonBlocks = extractJsonBlocks(assistant);
    let schemaOk = false;
    for (const j of jsonBlocks) {
      if (j && validateCanvas(j)) {
        schemaOk = true;
        break;
      }
    }
    if (schemaOk) linesWithSchemaValidBlock++;

    perLine.push({
      eval_id: rec.metadata?.eval_id,
      hive_images_in_assistant: unique,
      unknown_hive_images: unknown,
      json_blocks_parsed: jsonBlocks.filter((x) => x !== null).length,
      json_blocks_total: jsonBlocks.length,
      canvas_schema_valid_any: schemaOk,
    });
  }

  const n = lines.length || 1;
  const summary = {
    generated_at: new Date().toISOString(),
    source_file: path.relative(REPO_ROOT, file),
    golden_eval_lines: lines.length,
    parse_ok: parseOk,
    lines_with_assistant_hive_mention: linesWithHiveMention,
    lines_all_mentioned_images_canonical: linesAllCanonical,
    lines_with_unknown_hive_image: unknownImageLines,
    lines_with_valid_canvas_schema_json_block: linesWithSchemaValidBlock,
    rates: {
      hive_mention: linesWithHiveMention / n,
      all_canonical_when_mentioned: linesWithHiveMention ? linesAllCanonical / linesWithHiveMention : null,
      schema_json_block: linesWithSchemaValidBlock / n,
    },
    note:
      "Reference labels (gold): high scores = dataset consistent with canonical + schema. For model runs, compare same metrics on model outputs.",
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const payload = { summary, canonical_image_count: allowed.size, per_line: perLine };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf8");
  console.log(JSON.stringify({ ...summary, report: OUT }, null, 2));
}

try {
  main();
} catch (e) {
  cliErr("eval-copilot-quality:", e instanceof Error ? e.message : e);
  process.exit(1);
}
