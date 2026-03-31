import { describe, it } from "node:test";
import assert from "node:assert";
import { rateAllowSliding } from "./registry-sliding-window.mjs";

describe("rateAllowSliding", () => {
  it("allows when perMin is 0", () => {
    const m = new Map();
    assert.strictEqual(rateAllowSliding(m, "a", 0), true);
    assert.strictEqual(rateAllowSliding(m, "a", 0), true);
  });

  it("enforces limit within window", () => {
    const m = new Map();
    assert.strictEqual(rateAllowSliding(m, "ip1", 2), true);
    assert.strictEqual(rateAllowSliding(m, "ip1", 2), true);
    assert.strictEqual(rateAllowSliding(m, "ip1", 2), false);
    assert.strictEqual(rateAllowSliding(m, "ip2", 2), true);
  });
});
