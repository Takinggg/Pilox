import { describe, it } from "node:test";
import assert from "node:assert";
import { decideUpsert } from "./registry-upsert-logic.mjs";

describe("decideUpsert", () => {
  const cur = {
    handle: "urn:hive:cur-abcdef",
    updatedAt: "2026-06-01T00:00:00Z",
    schema: "hive-registry-record-v1",
    agentCardUrl: "https://a.example/card",
  };

  it("allows insert when no existing", () => {
    const inc = { ...cur, updatedAt: "2026-06-02T00:00:00Z" };
    const r = decideUpsert(undefined, inc, { rejectStale: true });
    assert.strictEqual(r.ok, true);
  });

  it("rejects stale when rejectStale", () => {
    const inc = { ...cur, updatedAt: "2026-05-01T00:00:00Z" };
    const r = decideUpsert(cur, inc, { rejectStale: true });
    assert.strictEqual(r.ok, false);
    if (!r.ok) {
      assert.strictEqual(r.status, 409);
      assert.strictEqual(r.error, "stale_updatedAt");
    }
  });

  it("allows newer when rejectStale", () => {
    const inc = { ...cur, updatedAt: "2026-07-01T00:00:00Z" };
    const r = decideUpsert(cur, inc, { rejectStale: true });
    assert.strictEqual(r.ok, true);
  });

  it("allows stale when rejectStale off", () => {
    const inc = { ...cur, updatedAt: "2026-05-01T00:00:00Z" };
    const r = decideUpsert(cur, inc, { rejectStale: false });
    assert.strictEqual(r.ok, true);
  });
});
