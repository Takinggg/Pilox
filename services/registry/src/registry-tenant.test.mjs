import { describe, it } from "node:test";
import assert from "node:assert";
import {
  normalizeTenantId,
  makeStorageKey,
  parseStorageKey,
  listLogicalHandlesForTenant,
  resolveHandlesForCard,
} from "./registry-tenant.mjs";

describe("registry-tenant", () => {
  it("normalizeTenantId accepts safe ids", () => {
    assert.deepStrictEqual(normalizeTenantId("acme_corp"), { ok: true, id: "acme_corp" });
    assert.equal(normalizeTenantId("").ok, false);
    assert.equal(normalizeTenantId("x".repeat(70)).ok, false);
  });

  it("makeStorageKey / parseStorageKey round-trip", () => {
    const sk = makeStorageKey(true, "t1", "handle12345678");
    assert.ok(sk.includes("\x1f"));
    assert.deepStrictEqual(parseStorageKey(true, sk), {
      tenantId: "t1",
      logicalHandle: "handle12345678",
    });
    assert.equal(makeStorageKey(false, "", "handle12345678"), "handle12345678");
  });

  it("listLogicalHandlesForTenant filters by prefix", () => {
    const m = new Map();
    m.set("t1\x1fh1", { agentCardUrl: "https://a/card" });
    m.set("t1\x1fh2", { agentCardUrl: "https://b/card" });
    m.set("t2\x1fh1", {});
    assert.deepStrictEqual(listLogicalHandlesForTenant(true, "t1", m).sort(), [
      "h1",
      "h2",
    ]);
    assert.deepStrictEqual(listLogicalHandlesForTenant(false, "", m).length, 3);
  });

  it("resolveHandlesForCard scopes by tenant", () => {
    const m = new Map();
    m.set("acme\x1fh1", { agentCardUrl: "https://x/card" });
    m.set("acme\x1fh2", { agentCardUrl: "https://y/card" });
    m.set("other\x1fh3", { agentCardUrl: "https://x/card" });
    assert.deepStrictEqual(
      resolveHandlesForCard(true, "acme", "https://x/card", m),
      ["h1"]
    );
  });
});
