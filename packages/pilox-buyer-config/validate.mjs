import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_SCHEMA = resolve(__dirname, "../../docs/schemas/pilox-buyer-input-item.v1.schema.json");

/**
 * @param {string} [schemaPath]
 */
function loadValidator(schemaPath) {
  const p = schemaPath ?? DEFAULT_SCHEMA;
  if (!existsSync(p)) {
    throw new Error(`pilox-buyer-input-item schema missing: ${p}`);
  }
  const schema = JSON.parse(readFileSync(p, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

let _cached = null;

function getValidator() {
  if (!_cached) _cached = loadValidator();
  return _cached;
}

/**
 * @param {unknown[]} items
 * @returns {{ ok: true } | { ok: false; errors: Array<{ index: number; instancePath: string; message: string }> }}
 */
export function validateBuyerInputItems(items) {
  if (!Array.isArray(items)) {
    return { ok: false, errors: [{ index: -1, instancePath: "", message: "buyerInputs must be an array" }] };
  }
  const validate = getValidator();
  /** @type {Array<{ index: number; instancePath: string; message: string }>} */
  const errors = [];
  for (let i = 0; i < items.length; i++) {
    if (!validate(items[i])) {
      const e = validate.errors?.[0];
      errors.push({
        index: i,
        instancePath: e?.instancePath ?? "",
        message: e?.message ?? "invalid",
      });
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true };
}
