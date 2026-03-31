#!/usr/bin/env node
/**
 * Validates JSON files under records/ against Hive registry record schema.
 * Fetches schema from Hive main (override with SCHEMA_BASE_URL).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RECORDS_DIR = join(ROOT, "records");

const BASE =
  (process.env.SCHEMA_BASE_URL ?? "https://raw.githubusercontent.com/Takinggg/Hive/main")
    .replace(/\/$/, "");

const LOCAL_SCHEMA_DIR = join(ROOT, "schemas");

async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  return r.text();
}

function listJsonFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) listJsonFiles(p, acc);
    else if (name.name.endsWith(".json")) acc.push(p);
  }
  return acc;
}

async function main() {
  const localRecord = join(LOCAL_SCHEMA_DIR, "hive-registry-record-v1.schema.json");
  const localBuyer = join(LOCAL_SCHEMA_DIR, "hive-buyer-input-item.v1.schema.json");
  let recordSchema;
  let buyerItemSchema;
  if (existsSync(localRecord) && existsSync(localBuyer)) {
    recordSchema = JSON.parse(readFileSync(localRecord, "utf8"));
    buyerItemSchema = JSON.parse(readFileSync(localBuyer, "utf8"));
  } else {
    recordSchema = JSON.parse(
      await fetchText(`${BASE}/docs/schemas/hive-registry-record-v1.schema.json`)
    );
    buyerItemSchema = JSON.parse(
      await fetchText(`${BASE}/docs/schemas/hive-buyer-input-item.v1.schema.json`)
    );
  }
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(buyerItemSchema);
  const validate = ajv.compile(recordSchema);

  const files = listJsonFiles(RECORDS_DIR);
  if (files.length === 0) {
    console.log("validate-records: no JSON under records/ — ok");
    return;
  }
  let errors = 0;
  for (const f of files) {
    let data;
    try {
      data = JSON.parse(readFileSync(f, "utf8"));
    } catch (e) {
      console.error(f, "parse error:", e?.message ?? e);
      errors++;
      continue;
    }
    if (!validate(data)) {
      console.error(f, validate.errors);
      errors++;
    }
  }
  if (errors > 0) {
    console.error(`validate-records: ${errors} file(s) failed`);
    process.exit(1);
  }
  console.log(`validate-records: ok (${files.length} file(s))`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
