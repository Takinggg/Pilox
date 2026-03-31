#!/usr/bin/env node
/**
 * Freeze dataset splits + manifest with SHA256 + git commit for reproducibility.
 *
 * Usage: node scripts/snapshot-hive-copilot-dataset.mjs
 * Output: datasets/hive-copilot-v1/snapshots/<ISO>_<githash>/
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cliErr } from "./cli-prefix.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const DATA = path.join(REPO_ROOT, "datasets/hive-copilot-v1");
const SPLITS = path.join(DATA, "splits");
const SNAPSHOTS = path.join(DATA, "snapshots");

function sha256File(fp) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(fp));
  return h.digest("hex");
}

function lineCount(fp) {
  const raw = fs.readFileSync(fp, "utf8").trim();
  if (!raw) return 0;
  return raw.split("\n").filter(Boolean).length;
}

function gitRev(full) {
  try {
    return execSync("git rev-parse " + (full ? "HEAD" : "--short HEAD"), {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

function main() {
  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  const short = gitRev(false);
  const dirName = `${iso}_${short}`;
  const outDir = path.join(SNAPSHOTS, dirName);
  fs.mkdirSync(outDir, { recursive: true });

  const files = fs.readdirSync(SPLITS).filter((f) => f.endsWith(".jsonl"));
  const fileMeta = {};
  for (const name of files) {
    const src = path.join(SPLITS, name);
    const dest = path.join(outDir, name);
    fs.copyFileSync(src, dest);
    fileMeta[name] = {
      sha256: sha256File(dest),
      lines: lineCount(dest),
      bytes: fs.statSync(dest).size,
    };
  }

  const manifestSrc = path.join(DATA, "manifest.json");
  let manifestSha = null;
  if (fs.existsSync(manifestSrc)) {
    fs.copyFileSync(manifestSrc, path.join(outDir, "manifest.json"));
    manifestSha = sha256File(path.join(outDir, "manifest.json"));
  }

  const snapshot = {
    created_at: new Date().toISOString(),
    git_commit_full: gitRev(true),
    git_commit_short: short,
    snapshot_id: dirName,
    files: fileMeta,
    manifest_sha256: manifestSha,
  };

  fs.writeFileSync(path.join(outDir, "snapshot.json"), JSON.stringify(snapshot, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        out_dir: outDir,
        snapshot_json: path.join(outDir, "snapshot.json"),
        copied_jsonl: files.length,
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (e) {
  cliErr("snapshot-hive-copilot-dataset:", e instanceof Error ? e.message : e);
  process.exit(1);
}
