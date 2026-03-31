/**
 * Optional inbound hardening for `X-Pilox-Federation-Secret` JSON-RPC.
 * When `MESH_FEDERATION_INBOUND_ALLOWLIST` is non-empty, only matching client IPs are accepted.
 *
 * Format: comma-separated entries, trimmed.
 * - IPv4 exact: `203.0.113.10`
 * - IPv4 CIDR: `203.0.113.0/24`
 * - IPv6 exact: full address string match
 * - IPv6 CIDR: `2001:db8::/32` (prefix 0–128)
 * Empty / whitespace-only = allow all (default).
 */

import { isIPv6 } from "node:net";

const IPV4_OCTET = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipv4ToUint32(ip: string): number | null {
  const m = ip.match(IPV4_OCTET);
  if (!m) return null;
  const o = [1, 2, 3, 4].map((i) => parseInt(m[i]!, 10));
  if (o.some((x) => x < 0 || x > 255)) return null;
  return (((o[0]! << 24) | (o[1]! << 16) | (o[2]! << 8) | o[3]!) >>> 0) as number;
}

function ipv4CidrContains(cidr: string, ip: string): boolean {
  const slash = cidr.indexOf("/");
  if (slash <= 0) return false;
  const base = cidr.slice(0, slash).trim();
  const bits = parseInt(cidr.slice(slash + 1), 10);
  if (!Number.isFinite(bits) || bits < 0 || bits > 32) return false;
  const ipN = ipv4ToUint32(ip);
  const baseN = ipv4ToUint32(base);
  if (ipN === null || baseN === null) return false;
  const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;
  return (ipN & mask) === (baseN & mask);
}

/** Expand IPv6 to 8 hextets of 4 hex digits (lowercase), or null if invalid. */
function expandIpv6(addr: string): string | null {
  const lower = addr.trim().toLowerCase();
  if (!lower.includes("::")) {
    const parts = lower.split(":");
    if (parts.length !== 8) return null;
    return parts.map((p) => p.padStart(4, "0")).join(":");
  }
  const [left, right] = lower.split("::", 2);
  const leftParts = left ? left.split(":").filter(Boolean) : [];
  const rightParts = right ? right.split(":").filter(Boolean) : [];
  const missing = 8 - leftParts.length - rightParts.length;
  if (missing < 0) return null;
  const all = [...leftParts, ...Array(missing).fill("0"), ...rightParts].map((p) =>
    p.padStart(4, "0")
  );
  if (all.length !== 8) return null;
  return all.join(":");
}

function ipv6ToBigInt(ip: string): bigint | null {
  if (!isIPv6(ip)) return null;
  const exp = expandIpv6(ip);
  if (!exp) return null;
  let acc = BigInt(0);
  const shift = BigInt(16);
  for (const h of exp.split(":")) {
    acc = (acc << shift) + BigInt(parseInt(h, 16));
  }
  return acc;
}

function ipv6CidrContains(cidr: string, ip: string): boolean {
  const slash = cidr.indexOf("/");
  if (slash <= 0) return false;
  const base = cidr.slice(0, slash).trim();
  const bits = parseInt(cidr.slice(slash + 1), 10);
  if (!Number.isFinite(bits) || bits < 0 || bits > 128) return false;
  if (!isIPv6(base) || !isIPv6(ip)) return false;
  const ipN = ipv6ToBigInt(ip);
  const baseN = ipv6ToBigInt(base);
  if (ipN === null || baseN === null) return false;
  if (bits === 0) return true;
  const highBits = BigInt(128 - bits);
  const one = BigInt(1);
  const mask = (one << BigInt(128)) - (one << highBits);
  return (ipN & mask) === (baseN & mask);
}

export function isFederationInboundIpAllowed(
  clientIp: string,
  allowlistRaw: string | undefined
): boolean {
  const raw = (allowlistRaw ?? "").trim();
  if (!raw) return true;
  const entries = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (entries.length === 0) return true;

  const ip = clientIp.trim() || "unknown";
  for (const entry of entries) {
    if (entry.includes("/")) {
      if (ipv4CidrContains(entry, ip)) return true;
      if (ipv6CidrContains(entry, ip)) return true;
      continue;
    }
    if (entry === ip) return true;
  }
  return false;
}
