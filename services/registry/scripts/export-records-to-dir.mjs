#!/usr/bin/env node
/**
 * Export all rows from hive_registry_records to JSON files (Git mirror).
 *
 * Usage:
 *   REGISTRY_DATABASE_URL=postgres://... node scripts/export-records-to-dir.mjs [OUT_DIR]
 *
 * Default OUT_DIR: ./registry-export/records
 * Each record is written as OUT_DIR/<handle>.json where "/" in handle becomes subdirs.
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_BASE = process.argv[2]?.trim() || join(ROOT, "registry-export", "records");

const dbUrl = process.env.REGISTRY_DATABASE_URL?.trim();
if (!dbUrl) {
  console.error("export-records: REGISTRY_DATABASE_URL is required");
  process.exit(1);
}

function handleToRelativePath(handle) {
  if (typeof handle !== "string" || !handle.trim()) {
    throw new Error("invalid handle");
  }
  const parts = handle.split("/").filter(Boolean);
  if (parts.length === 0) throw new Error("empty handle path");
  for (const p of parts) {
    if (p.includes("..") || p.includes("\\")) throw new Error(`unsafe segment: ${p}`);
  }
  return join(...parts) + ".json";
}

async function main() {
  const sql = postgres(dbUrl, { max: 2 });
  try {
    const rows = await sql`SELECT handle, record FROM hive_registry_records ORDER BY handle`;
    if (existsSync(OUT_BASE)) {
      rmSync(OUT_BASE, { recursive: true });
    }
    mkdirSync(OUT_BASE, { recursive: true });
    let n = 0;
    for (const row of rows) {
      const rel = handleToRelativePath(row.handle);
      const abs = join(OUT_BASE, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, JSON.stringify(row.record, null, 2) + "\n", "utf8");
      n++;
    }
    console.log(`export-records: wrote ${n} file(s) under ${OUT_BASE}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error("export-records:", e?.message ?? e);
  process.exit(1);
});
