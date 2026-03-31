import { describe, it, expect } from "vitest";
import { isFederationInboundIpAllowed } from "./mesh-federation-inbound-allowlist";

describe("isFederationInboundIpAllowed", () => {
  it("allows any IP when list empty", () => {
    expect(isFederationInboundIpAllowed("1.2.3.4", "")).toBe(true);
    expect(isFederationInboundIpAllowed("1.2.3.4", "   ")).toBe(true);
    expect(isFederationInboundIpAllowed("1.2.3.4", undefined)).toBe(true);
  });

  it("matches exact IPv4", () => {
    expect(
      isFederationInboundIpAllowed("10.0.0.5", "10.0.0.5,192.168.1.1")
    ).toBe(true);
    expect(isFederationInboundIpAllowed("10.0.0.6", "10.0.0.5")).toBe(false);
  });

  it("matches IPv4 CIDR", () => {
    expect(isFederationInboundIpAllowed("10.1.2.3", "10.1.0.0/16")).toBe(true);
    expect(isFederationInboundIpAllowed("10.2.0.1", "10.1.0.0/16")).toBe(false);
    expect(isFederationInboundIpAllowed("203.0.113.50", "203.0.113.0/24")).toBe(
      true
    );
  });

  it("matches exact non-IPv4 token (e.g. IPv6)", () => {
    const v6 = "2001:db8::1";
    expect(isFederationInboundIpAllowed(v6, `10.0.0.1,${v6}`)).toBe(true);
    expect(isFederationInboundIpAllowed("2001:db8::2", v6)).toBe(false);
  });

  it("matches IPv6 CIDR", () => {
    expect(
      isFederationInboundIpAllowed("2001:db8:1::2", "2001:db8::/32")
    ).toBe(true);
    expect(
      isFederationInboundIpAllowed("2001:db9::1", "2001:db8::/32")
    ).toBe(false);
  });
});
