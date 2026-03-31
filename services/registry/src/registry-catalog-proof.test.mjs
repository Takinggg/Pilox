import { describe, it } from "node:test";
import assert from "node:assert";
import {
  signCatalogListing,
  verifySignedCatalogResponse,
  catalogSigningPayload,
} from "./registry-catalog-proof.mjs";

describe("registry-catalog-proof", () => {
  const goodSeed = "a".repeat(64);

  it("round-trip sign and verify", () => {
    const handles = ["urn:hive:bbbbbbbb", "urn:hive:aaaaaaaa"];
    const issuedAt = "2026-03-20T12:00:00.000Z";
    const proof = signCatalogListing(goodSeed, handles, issuedAt, "cat1");
    const body = { handles: [...handles].sort(), catalogProof: proof };
    const v = verifySignedCatalogResponse(body);
    assert.strictEqual(v.ok, true);
  });

  it("rejects tampered handles", () => {
    const issuedAt = "2026-03-20T12:00:00.000Z";
    const proof = signCatalogListing(goodSeed, ["urn:hive:aaaaaaaa"], issuedAt, "k");
    const body = {
      handles: ["urn:hive:evilbbbbbb"],
      catalogProof: proof,
    };
    const v = verifySignedCatalogResponse(body);
    assert.strictEqual(v.ok, false);
    assert.strictEqual(v.reason, "bad_signature");
  });

  it("stable payload sorts handles", () => {
    const a = catalogSigningPayload(["z", "a"], "t");
    const b = catalogSigningPayload(["a", "z"], "t");
    assert.strictEqual(a, b);
  });

  it("rejects wrong seed length", () => {
    assert.throws(() => signCatalogListing("abcd", ["urn:hive:aaaaaaaa"], "t", "k"), /32_bytes/);
  });
});
