// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import {
  assertUrlSafeForEgressFetch,
  isPublicUnicastIp,
  postJsonWithSsrfGuard,
} from "./egress-ssrf-guard";

describe("isPublicUnicastIp", () => {
  it("rejects loopback and RFC1918", () => {
    expect(isPublicUnicastIp("127.0.0.1")).toBe(false);
    expect(isPublicUnicastIp("10.0.0.1")).toBe(false);
    expect(isPublicUnicastIp("172.16.0.1")).toBe(false);
    expect(isPublicUnicastIp("192.168.1.1")).toBe(false);
    expect(isPublicUnicastIp("169.254.169.254")).toBe(false);
  });

  it("accepts a public IPv4", () => {
    expect(isPublicUnicastIp("8.8.8.8")).toBe(true);
    expect(isPublicUnicastIp("1.1.1.1")).toBe(true);
  });
});

describe("assertUrlSafeForEgressFetch", () => {
  it("rejects non-http(s)", async () => {
    const r = await assertUrlSafeForEgressFetch("file:///etc/passwd");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("only_http_https");
  });

  it("rejects credentials in URL", async () => {
    const r = await assertUrlSafeForEgressFetch("https://user:pass@example.com/x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("credentials_in_url");
  });

  it("rejects literal private IP without allowlist", async () => {
    const r = await assertUrlSafeForEgressFetch("http://192.168.1.1/foo");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("literal_private_ip");
  });

  it("allows literal private IP when host matches explicit allowlist", async () => {
    const r = await assertUrlSafeForEgressFetch("http://192.168.1.1/foo", {
      hostAllowlist: ["192.168.1.1"],
    });
    expect(r.ok).toBe(true);
  });
});

describe("postJsonWithSsrfGuard", () => {
  it("rejects loopback without network call", async () => {
    const r = await postJsonWithSsrfGuard(
      "http://127.0.0.1/hook",
      { x: 1 },
      { timeoutMs: 3000, maxResponseBytes: 1024 },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.startsWith("ssrf:")).toBe(true);
  });
});
