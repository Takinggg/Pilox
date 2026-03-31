#!/usr/bin/env node
/**
 * Full audit: splits JSONL + knowledge + schema + manifests.
 * Usage: node scripts/audit-hive-copilot-dataset.mjs
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { cliErr } from "./cli-prefix.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const DATA = path.join(REPO_ROOT, "datasets/hive-copilot-v1");
const SPLITS = path.join(DATA, "splits");
const KNOWLEDGE = path.join(DATA, "knowledge");
const REPORTS = path.join(DATA, "reports");
const CANON = path.join(DATA, "canonical/hive-runtime-images.json");
const BLOCKS = path.join(KNOWLEDGE, "hive-blocks-v1.json");

const HIVE_IMG = /^hive\/[a-z0-9-]+:latest$/;

function sha256(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16);
}

function readJsonl(path) {
  if (!fs.existsSync(path)) return { lines: [], raw: "" };
  const raw = fs.readFileSync(path, "utf8").trim();
  if (!raw) return { lines: [], raw: "" };
  const lines = raw.split("\n").filter(Boolean);
  return { lines, raw };
}

function auditJsonl(name, filePath) {
  const { lines } = readJsonl(filePath);
  const stats = {
    file: name,
    path: path.relative(REPO_ROOT, filePath),
    line_count: lines.length,
    parse_errors: 0,
    messages_min: Infinity,
    messages_max: 0,
    roles_histogram: {},
    missing_system: 0,
    missing_assistant: 0,
    missing_user: 0,
    metadata_keys: {},
    locales: {},
    intent_tags_total: 0,
    hive_runtime_images_in_metadata: 0,
    hive_runtime_images_in_assistant_text: 0,
    invalid_hive_image_in_metadata: [],
    synthetic_flag: { true: 0, false: 0, undefined: 0 },
    gold_tier: {},
    kind: {},
    content_hashes: {},
    duplicate_hashes: [],
    assistant_chars: { min: Infinity, max: 0, sum: 0 },
    user_chars: { sum: 0, n: 0 },
  };

  for (let i = 0; i < lines.length; i++) {
    let rec;
    try {
      rec = JSON.parse(lines[i]);
    } catch {
      stats.parse_errors++;
      continue;
    }
    const msgs = rec.messages;
    if (!Array.isArray(msgs)) {
      stats.parse_errors++;
      continue;
    }
    const n = msgs.length;
    stats.messages_min = Math.min(stats.messages_min, n);
    stats.messages_max = Math.max(stats.messages_max, n);
    const roles = new Set(msgs.map((m) => m.role));
    for (const m of msgs) {
      stats.roles_histogram[m.role] = (stats.roles_histogram[m.role] || 0) + 1;
    }
    if (!roles.has("system")) stats.missing_system++;
    if (!roles.has("assistant")) stats.missing_assistant++;
    if (!roles.has("user")) stats.missing_user++;

    const md = rec.metadata || {};
    for (const k of Object.keys(md)) {
      stats.metadata_keys[k] = (stats.metadata_keys[k] || 0) + 1;
    }
    if (md.locale) stats.locales[md.locale] = (stats.locales[md.locale] || 0) + 1;
    if (Array.isArray(md.intent_tags)) stats.intent_tags_total += md.intent_tags.length;
    if (Array.isArray(md.hive_runtime_images)) {
      stats.hive_runtime_images_in_metadata++;
      for (const im of md.hive_runtime_images) {
        if (!HIVE_IMG.test(im)) stats.invalid_hive_image_in_metadata.push({ line: i + 1, image: im });
      }
    }
    const ast = msgs.filter((m) => m.role === "assistant").pop();
    if (ast?.content) {
      const m = ast.content.match(/hive\/[a-z0-9-]+:latest/g);
      if (m?.length) stats.hive_runtime_images_in_assistant_text++;
      const len = ast.content.length;
      stats.assistant_chars.min = Math.min(stats.assistant_chars.min, len);
      stats.assistant_chars.max = Math.max(stats.assistant_chars.max, len);
      stats.assistant_chars.sum += len;
    }
    const usr = msgs.filter((m) => m.role === "user").pop();
    if (usr?.content) {
      stats.user_chars.sum += usr.content.length;
      stats.user_chars.n++;
    }

    if (md.synthetic === true) stats.synthetic_flag.true++;
    else if (md.synthetic === false) stats.synthetic_flag.false++;
    else stats.synthetic_flag.undefined++;

    if (md.gold_tier) stats.gold_tier[md.gold_tier] = (stats.gold_tier[md.gold_tier] || 0) + 1;
    if (md.kind) stats.kind[md.kind] = (stats.kind[md.kind] || 0) + 1;

    const h = sha256(lines[i]);
    if (stats.content_hashes[h] !== undefined) {
      stats.duplicate_hashes.push({ hash: h, first_line: stats.content_hashes[h], duplicate_line: i + 1 });
    } else {
      stats.content_hashes[h] = i + 1;
    }
  }

  if (stats.messages_min === Infinity) stats.messages_min = 0;
  if (stats.assistant_chars.min === Infinity) stats.assistant_chars.min = 0;
  stats.assistant_chars.avg =
    lines.length - stats.parse_errors > 0
      ? stats.assistant_chars.sum / (lines.length - stats.parse_errors)
      : 0;

  return stats;
}

function loadCanonicalImages() {
  if (!fs.existsSync(CANON)) return new Set();
  const j = JSON.parse(fs.readFileSync(CANON, "utf8"));
  const set = new Set();
  const walk = (o) => {
    if (typeof o === "string" && HIVE_IMG.test(o)) set.add(o);
    else if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") Object.values(o).forEach(walk);
  };
  walk(j);
  return set;
}

function loadBlocksImages() {
  if (!fs.existsSync(BLOCKS)) return new Set();
  const data = JSON.parse(fs.readFileSync(BLOCKS, "utf8"));
  return new Set((data.blocks || []).map((b) => b.image).filter(Boolean));
}

function main() {
  const canonical = loadCanonicalImages();
  const blockImages = loadBlocksImages();

  const files = [
    ["train.jsonl", path.join(SPLITS, "train.jsonl")],
    ["synthetic-train.jsonl", path.join(SPLITS, "synthetic-train.jsonl")],
    ["synthetic-val.jsonl", path.join(SPLITS, "synthetic-val.jsonl")],
    ["combined-train.jsonl", path.join(SPLITS, "combined-train.jsonl")],
    ["golden-eval.jsonl", path.join(SPLITS, "golden-eval.jsonl")],
    ["public-sources-train.jsonl", path.join(SPLITS, "public-sources-train.jsonl")],
  ];

  const perFile = {};
  for (const [name, p] of files) {
    perFile[name] = auditJsonl(name, p);
  }

  const ragChunks = fs.existsSync(path.join(KNOWLEDGE, "rag-chunks"))
    ? fs.readdirSync(path.join(KNOWLEDGE, "rag-chunks")).filter((f) => f.endsWith(".md")).length
    : 0;

  const manifestFast = path.join(DATA, "external/hf/download-manifest-fast.json");
  const manifestMain = path.join(DATA, "external/hf/download-manifest-main.json");
  const manifestTb = path.join(DATA, "external/hf/download-manifest-toolbench.json");

  const manifest = {
    download_manifest_fast: fs.existsSync(manifestFast) ? JSON.parse(fs.readFileSync(manifestFast, "utf8")) : null,
    download_manifest_main: fs.existsSync(manifestMain) ? JSON.parse(fs.readFileSync(manifestMain, "utf8")) : null,
    download_manifest_toolbench: fs.existsSync(manifestTb) ? JSON.parse(fs.readFileSync(manifestTb, "utf8")) : null,
  };

  const combined = perFile["combined-train.jsonl"];
  const issues = [];
  if (combined.parse_errors > 0) issues.push({ level: "error", msg: `combined-train: ${combined.parse_errors} JSON parse errors` });
  if (invalidTotal(perFile)) issues.push({ level: "warn", msg: "Some metadata hive_runtime_images fail regex" });

  const report = {
    generated_at: new Date().toISOString(),
    repo_root: REPO_ROOT,
    summary: {
      canonical_hive_runtime_images_count: canonical.size,
      hive_blocks_v1_image_count: blockImages.size,
      rag_markdown_chunks: ragChunks,
      combined_train_lines: combined.line_count,
      gold_train_lines: perFile["train.jsonl"].line_count,
      synthetic_train_lines: perFile["synthetic-train.jsonl"].line_count,
      synthetic_val_lines: perFile["synthetic-val.jsonl"].line_count,
      golden_eval_lines: perFile["golden-eval.jsonl"].line_count,
      public_sources_lines: perFile["public-sources-train.jsonl"].line_count,
    },
    per_file: perFile,
    external_manifests: manifest,
    issues,
    checks: {
      block_images_subset_of_pattern: [...blockImages].every((img) => HIVE_IMG.test(img)),
      gold_not_in_combined: "golden-eval is separate by design",
    },
  };

  fs.mkdirSync(REPORTS, { recursive: true });
  const outJson = path.join(REPORTS, "dataset-audit.json");
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2), "utf8");

  const md = renderMarkdown(report);
  const outMd = path.join(REPORTS, "dataset-audit.md");
  fs.writeFileSync(outMd, md, "utf8");

  console.log(JSON.stringify({ ...report.summary, outJson, outMd }, null, 2));
}

function invalidTotal(perFile) {
  let n = 0;
  for (const s of Object.values(perFile)) {
    n += (s.invalid_hive_image_in_metadata || []).length;
  }
  return n > 0;
}

function renderMarkdown(r) {
  const s = r.summary;
  let o = `# Hive copilot dataset — audit\n\nGenerated: ${r.generated_at}\n\n`;
  o += `## Summary\n\n`;
  o += `| Metric | Value |\n|--------|-------|\n`;
  o += `| Blocks (hive-blocks-v1.json) | ${s.hive_blocks_v1_image_count} |\n`;
  o += `| Canonical runtime images (canonical) | ${s.canonical_hive_runtime_images_count} |\n`;
  o += `| RAG chunks (*.md) | ${s.rag_markdown_chunks} |\n`;
  o += `| train.jsonl (gold) | ${s.gold_train_lines} |\n`;
  o += `| synthetic-train.jsonl | ${s.synthetic_train_lines} |\n`;
  o += `| synthetic-val.jsonl | ${s.synthetic_val_lines} |\n`;
  o += `| combined-train.jsonl | ${s.combined_train_lines} |\n`;
  o += `| golden-eval.jsonl (held-out) | ${s.golden_eval_lines} |\n`;
  o += `| public-sources-train.jsonl | ${s.public_sources_lines} |\n\n`;

  o += `## Per-file quality\n\n`;
  for (const [name, st] of Object.entries(r.per_file)) {
    if (st.line_count === 0 && !fs.existsSync(path.join(SPLITS, name))) continue;
    o += `### ${name}\n\n`;
    o += `- Lines: ${st.line_count}, parse errors: ${st.parse_errors}\n`;
    o += `- Messages per record: min ${st.messages_min}, max ${st.messages_max}\n`;
    o += `- Roles (token count): ${JSON.stringify(st.roles_histogram)}\n`;
    o += `- Missing system/user/assistant in any record: ${st.missing_system}/${st.missing_user}/${st.missing_assistant}\n`;
    if (st.assistant_chars.avg) o += `- Assistant reply length (chars): avg ${st.assistant_chars.avg.toFixed(0)}, min ${st.assistant_chars.min}, max ${st.assistant_chars.max}\n`;
    if (Object.keys(st.locales).length) o += `- Locales: ${JSON.stringify(st.locales)}\n`;
    if (st.invalid_hive_image_in_metadata?.length) o += `- **Invalid hive image in metadata:** ${JSON.stringify(st.invalid_hive_image_in_metadata.slice(0, 5))}\n`;
    if (st.duplicate_hashes?.length) o += `- **Duplicate records (sha256):** ${st.duplicate_hashes.length} pairs\n`;
    o += `\n`;
  }

  o += `## External HF manifests\n\n`;
  if (r.external_manifests.download_manifest_fast) {
    o += `- download-manifest-fast.json: ${r.external_manifests.download_manifest_fast.length} entries\n`;
  }
  if (r.external_manifests.download_manifest_main) {
    o += `- download-manifest-main.json: ${r.external_manifests.download_manifest_main.length} entries\n`;
  }
  if (r.external_manifests.download_manifest_toolbench) {
    o += `- download-manifest-toolbench.json: ${r.external_manifests.download_manifest_toolbench.length} entries\n`;
  }
  if (!r.external_manifests.download_manifest_fast && !r.external_manifests.download_manifest_main) {
    o += `_(no manifest files found or empty — downloads may still be in progress)_\n`;
  }

  o += `\n## Notes\n\n`;
  o += `- **combined-train** = gold + synthetic (+ public when present); **golden-eval** must stay out of training.\n`;
  o += `- Full JSON: \`reports/dataset-audit.json\`.\n`;
  return o;
}

try {
  main();
} catch (e) {
  cliErr("audit-hive-copilot-dataset:", e instanceof Error ? e.message : e);
  process.exit(1);
}
