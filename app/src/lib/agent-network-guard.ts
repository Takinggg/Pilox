/**
 * Network guard — validates agent IP addresses to prevent SSRF attacks.
 *
 * Only allows IPs within Docker's internal network ranges (172.16-31.x.x, 10.x.x.x).
 * Blocks loopback, link-local, metadata endpoints, and non-RFC1918 addresses.
 */

/** RFC 1918 + Docker-typical ranges that agent containers legitimately use. */
const ALLOWED_RANGES = [
  // 10.0.0.0/8 — Docker default bridge, overlay networks
  { start: 0x0a000000, end: 0x0affffff },
  // 172.16.0.0/12 — Docker default bridge (172.17.x.x), custom networks
  { start: 0xac100000, end: 0xac1fffff },
  // 192.168.0.0/16 — common in Docker Compose setups
  { start: 0xc0a80000, end: 0xc0a8ffff },
];

/** Addresses that are NEVER valid targets, even within allowed ranges. */
const BLOCKED_IPS = new Set([
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "localhost",
  // AWS/GCP/Azure metadata endpoints
  "169.254.169.254",
  "metadata.google.internal",
]);

function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const n = parseInt(part, 10);
    if (isNaN(n) || n < 0 || n > 255) return null;
    result = (result << 8) | n;
  }
  return result >>> 0; // unsigned
}

/**
 * Validate that an IP address belongs to a Docker internal network.
 * Returns true if the IP is safe to proxy to, false otherwise.
 */
export function isAllowedAgentIP(ip: string | null | undefined): boolean {
  if (!ip) return false;

  // Block known-bad targets
  if (BLOCKED_IPS.has(ip.toLowerCase())) return false;

  // Must be a valid IPv4 address in a Docker-typical range
  const ipInt = ipToInt(ip);
  if (ipInt === null) return false;

  // Block loopback (127.0.0.0/8)
  if ((ipInt >>> 24) === 127) return false;

  // Block link-local (169.254.0.0/16) — includes metadata endpoint
  if ((ipInt >>> 16) === 0xa9fe) return false;

  // Block multicast (224.0.0.0/4)
  if ((ipInt >>> 28) === 14) return false;

  // Must be in an allowed private range
  for (const range of ALLOWED_RANGES) {
    if (ipInt >= range.start && ipInt <= range.end) return true;
  }

  return false;
}
