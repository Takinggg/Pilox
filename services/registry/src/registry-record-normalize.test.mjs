import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { normalizeRegistryRecord } from "./registry-record-normalize.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, "..", "..", "..", "docs", "schemas", "hive-registry-record-v1.schema.json");
const buyerItemPath = resolve(dirname(schemaPath), "hive-buyer-input-item.v1.schema.json");
const recordSchema = JSON.parse(readFileSync(schemaPath, "utf8"));
const buyerItemSchema = JSON.parse(readFileSync(buyerItemPath, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(buyerItemSchema);
const validateRecord = ajv.compile(recordSchema);

describe("normalizeRegistryRecord", () => {
  it("merges hiveBuyerInputs into buyerInputs and validates", () => {
    const rec = {
      schema: "hive-registry-record-v1",
      handle: "urn:test:agent:normalize:01",
      updatedAt: "2026-03-20T12:00:00Z",
      agentCardUrl: "https://example.com/card.json",
      hiveBuyerInputs: [{ label: "Token", key: "API_TOKEN", kind: "secret" }],
    };
    normalizeRegistryRecord(rec);
    assert.ok(Array.isArray(rec.buyerInputs));
    assert.strictEqual(rec.buyerInputs.length, 1);
    assert.strictEqual(rec.hiveBuyerInputs, undefined);
    assert.ok(validateRecord(rec));
  });

  it("maps docsUrl to documentationUrl", () => {
    const rec = {
      schema: "hive-registry-record-v1",
      handle: "urn:test:agent:normalize:02",
      updatedAt: "2026-03-20T12:00:00Z",
      agentCardUrl: "https://example.com/card.json",
      docsUrl: "https://example.com/docs",
    };
    normalizeRegistryRecord(rec);
    assert.strictEqual(rec.documentationUrl, "https://example.com/docs");
    assert.strictEqual(rec.docsUrl, undefined);
    assert.ok(validateRecord(rec));
  });
});
