import { describe, it } from "node:test";
import assert from "node:assert";
import {
  recordWeakEtag,
  etagNotModified,
  ifMatchValidForUpdate,
} from "./registry-record-etag.mjs";

describe("recordWeakEtag", () => {
  it("is stable for same logical record", () => {
    const a = { z: 1, a: 2 };
    const b = { a: 2, z: 1 };
    assert.strictEqual(recordWeakEtag(a), recordWeakEtag(b));
  });
});

describe("etagNotModified", () => {
  const etag = 'W/"abcdef0123456789abcdef0123456789"';
  it("matches exact weak", () => {
    assert.strictEqual(etagNotModified(etag, etag), true);
  });
  it("matches *", () => {
    assert.strictEqual(etagNotModified("*", etag), true);
  });
  it("no header", () => {
    assert.strictEqual(etagNotModified(undefined, etag), false);
  });
});

describe("ifMatchValidForUpdate", () => {
  const etag = 'W/"0123456789abcdef0123456789abcdef"';
  it("requires match", () => {
    assert.strictEqual(ifMatchValidForUpdate(etag, etag), true);
    assert.strictEqual(ifMatchValidForUpdate('W/"wrong"', etag), false);
  });
  it("accepts *", () => {
    assert.strictEqual(ifMatchValidForUpdate("*", etag), true);
  });
});
