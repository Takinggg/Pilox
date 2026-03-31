import { describe, it } from "node:test";
import assert from "node:assert";
import { assertUrlSafeForPublishFetch } from "./registry-ssrf-fetch.mjs";

describe("assertUrlSafeForPublishFetch", () => {
  it("rejects loopback IPv4", async () => {
    const r = await assertUrlSafeForPublishFetch("http://127.0.0.1:8080/x");
    assert.strictEqual(r.ok, false);
  });

  it("rejects file protocol", async () => {
    const r = await assertUrlSafeForPublishFetch("file:///etc/passwd");
    assert.strictEqual(r.ok, false);
  });

  it("enforces host allowlist when provided", async () => {
    const r = await assertUrlSafeForPublishFetch("https://evil.com/x", {
      hostAllowlist: ["example.com"],
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, "host_not_allowlisted");
  });
});
