import { describe, it, expect } from "vitest";
import { isAllowedAgentIP } from "./agent-network-guard";

describe("isAllowedAgentIP", () => {
  // ── Allowed Docker-typical IPs ──────────────────────
  it("allows 172.17.x.x (Docker default bridge)", () => {
    expect(isAllowedAgentIP("172.17.0.2")).toBe(true);
    expect(isAllowedAgentIP("172.17.0.100")).toBe(true);
  });

  it("allows 172.18-31.x.x (Docker custom networks)", () => {
    expect(isAllowedAgentIP("172.18.0.5")).toBe(true);
    expect(isAllowedAgentIP("172.31.255.254")).toBe(true);
  });

  it("allows 10.x.x.x (overlay networks)", () => {
    expect(isAllowedAgentIP("10.0.0.1")).toBe(true);
    expect(isAllowedAgentIP("10.255.255.254")).toBe(true);
  });

  it("allows 192.168.x.x (compose networks)", () => {
    expect(isAllowedAgentIP("192.168.1.100")).toBe(true);
  });

  // ── Blocked dangerous IPs ──────────────────────────
  it("blocks loopback 127.0.0.1", () => {
    expect(isAllowedAgentIP("127.0.0.1")).toBe(false);
  });

  it("blocks all loopback range 127.x.x.x", () => {
    expect(isAllowedAgentIP("127.0.0.2")).toBe(false);
    expect(isAllowedAgentIP("127.255.255.255")).toBe(false);
  });

  it("blocks 0.0.0.0", () => {
    expect(isAllowedAgentIP("0.0.0.0")).toBe(false);
  });

  it("blocks AWS/GCP metadata endpoint 169.254.169.254", () => {
    expect(isAllowedAgentIP("169.254.169.254")).toBe(false);
  });

  it("blocks all link-local 169.254.x.x", () => {
    expect(isAllowedAgentIP("169.254.0.1")).toBe(false);
    expect(isAllowedAgentIP("169.254.255.255")).toBe(false);
  });

  it("blocks public IPs", () => {
    expect(isAllowedAgentIP("8.8.8.8")).toBe(false);
    expect(isAllowedAgentIP("1.1.1.1")).toBe(false);
    expect(isAllowedAgentIP("203.0.113.1")).toBe(false);
  });

  it("blocks multicast addresses", () => {
    expect(isAllowedAgentIP("224.0.0.1")).toBe(false);
    expect(isAllowedAgentIP("239.255.255.255")).toBe(false);
  });

  // ── Edge cases ─────────────────────────────────────
  it("blocks null/undefined/empty", () => {
    expect(isAllowedAgentIP(null)).toBe(false);
    expect(isAllowedAgentIP(undefined)).toBe(false);
    expect(isAllowedAgentIP("")).toBe(false);
  });

  it("blocks localhost string", () => {
    expect(isAllowedAgentIP("localhost")).toBe(false);
  });

  it("blocks invalid IP formats", () => {
    expect(isAllowedAgentIP("not-an-ip")).toBe(false);
    expect(isAllowedAgentIP("256.1.1.1")).toBe(false);
    expect(isAllowedAgentIP("172.17.0")).toBe(false);
  });

  // Out of /12 range — 172.32.x.x is NOT in 172.16-31
  it("blocks 172.32+ (outside Docker /12 range)", () => {
    expect(isAllowedAgentIP("172.32.0.1")).toBe(false);
  });
});
