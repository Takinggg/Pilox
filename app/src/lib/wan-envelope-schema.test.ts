import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");
const schemaPath = join(repoRoot, "docs", "schemas", "wan-envelope-v1.schema.json");

function compile() {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

describe("docs/schemas/wan-envelope-v1.schema.json", () => {
  const validate = compile();

  it("accepts minimal envelope", () => {
    const ok = validate({
      v: 1,
      correlationId: "abcd1234",
      sourceOrigin: "https://a.example",
    });
    expect(ok, JSON.stringify(validate.errors)).toBe(true);
  });

  it("accepts tagged envelope with payload", () => {
    const ok = validate({
      schema: "wan-envelope-v1",
      v: 1,
      correlationId: "abcd1234",
      sourceOrigin: "https://a.example",
      targetOrigin: "https://b.example",
      targetHandle: "h1",
      payload: { x: 1 },
    });
    expect(ok, JSON.stringify(validate.errors)).toBe(true);
  });

  it("rejects unknown top-level properties", () => {
    const ok = validate({
      v: 1,
      correlationId: "abcd1234",
      sourceOrigin: "https://a.example",
      meshSig: "opaque-extension",
    });
    expect(ok).toBe(false);
  });

  it("rejects wrong v", () => {
    const ok = validate({
      v: 2,
      correlationId: "abcd1234",
      sourceOrigin: "https://a.example",
    });
    expect(ok).toBe(false);
  });

  it("rejects short correlationId", () => {
    const ok = validate({
      v: 1,
      correlationId: "short",
      sourceOrigin: "https://a.example",
    });
    expect(ok).toBe(false);
  });

  it("rejects invalid sourceOrigin uri", () => {
    const ok = validate({
      v: 1,
      correlationId: "abcd1234",
      sourceOrigin: "not-a-uri",
    });
    expect(ok).toBe(false);
  });
});
