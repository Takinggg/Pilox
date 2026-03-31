import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");
const schemaPath = join(
  repoRoot,
  "docs",
  "schemas",
  "pilox-registry-record-v1.schema.json"
);

const buyerInputSchemaPath = join(
  repoRoot,
  "docs",
  "schemas",
  "pilox-buyer-input-item.v1.schema.json"
);

function compile() {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as object;
  const buyerInputSchema = JSON.parse(
    readFileSync(buyerInputSchemaPath, "utf8")
  ) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(
    buyerInputSchema,
    "https://github.com/pilox/schemas/pilox-buyer-input-item-v1"
  );
  return ajv.compile(schema);
}

describe("docs/schemas/pilox-registry-record-v1.schema.json", () => {
  const validate = compile();

  it("accepts services/registry/seed-record.example.json shape", () => {
    const seedPath = join(
      repoRoot,
      "services",
      "registry",
      "seed-record.example.json"
    );
    const rec = JSON.parse(readFileSync(seedPath, "utf8"));
    const ok = validate(rec);
    expect(ok, JSON.stringify(validate.errors)).toBe(true);
  });

  it("rejects wrong schema const", () => {
    const ok = validate({
      schema: "wrong",
      handle: "urn:pilox:x".padEnd(12, "y"),
      updatedAt: "2026-01-01T00:00:00Z",
      agentCardUrl: "https://a.example/card",
    });
    expect(ok).toBe(false);
  });

  it("accepts optional proof (P5 attestation hook)", () => {
    const ok = validate({
      schema: "pilox-registry-record-v1",
      handle: "urn:pilox:proof-test-1",
      updatedAt: "2026-01-01T00:00:00Z",
      agentCardUrl: "https://a.example/card",
      proof: {
        type: "ed25519-attestation-v0",
        signer: "https://registrar.example",
        sigHex: "a".repeat(128),
      },
    });
    expect(ok, JSON.stringify(validate.errors)).toBe(true);
  });

  it("accepts optional controllerDid and didDocumentUrl", () => {
    const ok = validate({
      schema: "pilox-registry-record-v1",
      handle: "urn:pilox:did-hook-abcdef",
      updatedAt: "2026-03-20T00:00:00Z",
      agentCardUrl: "https://a.example/card",
      controllerDid: "did:web:example.com:user:alice",
      didDocumentUrl: "https://example.com/did/alice",
    });
    expect(ok, JSON.stringify(validate.errors)).toBe(true);
  });
});
