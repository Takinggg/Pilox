import { describe, it } from "node:test";
import assert from "node:assert";
import { isValidUntilExpired } from "./registry-record-validity.mjs";

describe("isValidUntilExpired", () => {
  it("false when validUntil absent", () => {
    assert.strictEqual(isValidUntilExpired({ handle: "x".padEnd(10, "y") }), false);
  });

  it("true when in the past", () => {
    assert.strictEqual(
      isValidUntilExpired({ validUntil: "2000-01-01T00:00:00Z" }),
      true
    );
  });

  it("false when in the future", () => {
    assert.strictEqual(
      isValidUntilExpired({ validUntil: "2099-01-01T00:00:00Z" }),
      false
    );
  });
});
