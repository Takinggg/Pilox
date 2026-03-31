import test from "node:test";
import assert from "node:assert/strict";
import {
  hashInstanceToken,
  handleOwnedByTenant,
  slugValid,
  normalizeInstanceOrigin,
  parseAdminCreateBody,
  tokenMatchesStoredHash,
} from "./registry-instance-auth.mjs";

test("hashInstanceToken is stable sha256 hex", () => {
  const h = hashInstanceToken("abc");
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(hashInstanceToken("abc"), h);
});

test("tokenMatchesStoredHash", () => {
  const tok = "a".repeat(64);
  const hx = hashInstanceToken(tok);
  assert.equal(tokenMatchesStoredHash(tok, hx), true);
  assert.equal(tokenMatchesStoredHash("b".repeat(64), hx), false);
});

test("handleOwnedByTenant", () => {
  assert.equal(handleOwnedByTenant("acme01/my-bot", "acme01"), true);
  assert.equal(handleOwnedByTenant("acme01/my-bot/extra", "acme01"), false);
  assert.equal(handleOwnedByTenant("other/my-bot", "acme01"), false);
  assert.equal(handleOwnedByTenant("acme01/", "acme01"), false);
});

test("slugValid", () => {
  assert.equal(slugValid("a"), true);
  assert.equal(slugValid("my-bot"), true);
  assert.equal(slugValid("My-Bot"), false);
  assert.equal(slugValid("-x"), false);
});

test("normalizeInstanceOrigin requires https", () => {
  assert.equal(normalizeInstanceOrigin("https://hive.example.com/path").ok, true);
  assert.equal(normalizeInstanceOrigin("http://x.com").ok, false);
});

test("parseAdminCreateBody", () => {
  const ok = parseAdminCreateBody("acme01", "https://hive.example.com");
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.tenantKey, "acme01");
    assert.equal(ok.origin, "https://hive.example.com");
  }
  assert.equal(parseAdminCreateBody("", "https://x.com").ok, false);
});
