/**
 * Outbound fetch hardening for publish-readiness (SSRF / redirect bypass).
 */

import dns from "node:dns/promises";
import net from "node:net";

const MAX_REDIRECTS = Math.min(
  10,
  Math.max(0, Number(process.env.REGISTRY_PUBLISH_FETCH_MAX_REDIRECTS) || 5)
);

/**
 * @param {string} raw
 * @returns {string[]}
 */
function parseHostAllowlist(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const HOST_ALLOWLIST = parseHostAllowlist(
  process.env.REGISTRY_PUBLISH_FETCH_HOST_ALLOWLIST ?? ""
);

/**
 * @param {string} ip
 * @returns {boolean} true if acceptable for egress (public unicast)
 */
function isPublicIp(ip) {
  if (!ip || typeof ip !== "string") return false;
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map((x) => Number(x));
    if (a === 10) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 127) return false;
    if (a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a >= 224) return false;
    return true;
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    if (x === "::1") return false;
    if (x.startsWith("fe80:")) return false;
    if (x.startsWith("fc") || x.startsWith("fd")) return false;
    if (x.startsWith("::ffff:")) {
      const v4 = x.slice(7);
      return isPublicIp(v4);
    }
    return true;
  }
  return false;
}

/**
 * @param {string} hostname
 * @returns {Promise<{ ok: true } | { ok: false; reason: string }>}
 */
async function dnsResolvesOnlyPublic(hostname) {
  try {
    const addrs = await dns.lookup(hostname, { all: true, verbatim: true });
    if (!addrs.length) return { ok: false, reason: "dns_no_results" };
    for (const a of addrs) {
      if (!isPublicIp(a.address)) {
        return { ok: false, reason: `dns_private:${a.address}` };
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `dns_error:${e?.message ?? e}` };
  }
}

/**
 * @param {string} urlString
 * @param {{ hostAllowlist?: string[] }} [opts]
 * @returns {Promise<{ ok: true; url: string } | { ok: false; reason: string }>}
 */
export async function assertUrlSafeForPublishFetch(urlString, opts = {}) {
  let u;
  try {
    u = new URL(urlString);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason: "only_http_https" };
  }
  if (u.username || u.password) {
    return { ok: false, reason: "credentials_in_url" };
  }
  const host = u.hostname;
  const allow = opts.hostAllowlist?.length ? opts.hostAllowlist : HOST_ALLOWLIST;
  if (allow.length > 0) {
    const h = host.toLowerCase();
    const okHost = allow.some((a) => h === a || h.endsWith(`.${a}`));
    if (!okHost) return { ok: false, reason: "host_not_allowlisted" };
  }
  if (net.isIP(host)) {
    if (!isPublicIp(host)) return { ok: false, reason: "literal_private_ip" };
    return { ok: true, url: u.href };
  }
  const dr = await dnsResolvesOnlyPublic(host);
  if (!dr.ok) return dr;
  return { ok: true, url: u.href };
}

/**
 * @param {string} urlString
 * @param {{
 *   timeoutMs: number;
 *   hostAllowlist?: string[];
 * }} opts
 * @returns {Promise<{ ok: true; json: unknown; finalUrl: string } | { ok: false; error: string }>}
 */
export async function fetchJsonWithSsrfGuard(urlString, opts) {
  let current = urlString;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), opts.timeoutMs);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const gate = await assertUrlSafeForPublishFetch(current, {
        hostAllowlist: opts.hostAllowlist,
      });
      if (!gate.ok) {
        return { ok: false, error: `ssrf:${gate.reason}` };
      }
      const target = gate.url;
      const r = await fetch(target, {
        signal: ac.signal,
        headers: { Accept: "application/json" },
        redirect: "manual",
      });
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get("location");
        if (!loc) return { ok: false, error: "redirect_missing_location" };
        current = new URL(loc, target).href;
        continue;
      }
      if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
      const json = await r.json();
      return { ok: true, json, finalUrl: target };
    }
    return { ok: false, error: "too_many_redirects" };
  } catch (e) {
    const msg =
      e && typeof e === "object" && "name" in e && e.name === "AbortError"
        ? "timeout"
        : String(e?.message ?? e);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(t);
  }
}
