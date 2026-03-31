// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Outbound HTTP(S) hardening for operator-triggered fetches (agent import, update checks).
 * Blocks private/link-local/metadata targets and re-validates each redirect hop.
 *
 * Optional `PILOX_EGRESS_FETCH_HOST_ALLOWLIST` (comma-separated): when non-empty, only those
 * hostnames (exact or suffix) may be used; resolved addresses may be private (on-prem registries).
 * When empty, every hostname must resolve only to public unicast IPs.
 */

import dns from "node:dns/promises";
import net from "node:net";
import { getMergedEgressHostAllowlist } from "./instance-security-policy";
import { effectiveEgressMaxRedirects } from "./runtime-instance-config";

function parseHostAllowlist(raw: string | undefined): string[] {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function maxRedirects(): number {
  return effectiveEgressMaxRedirects();
}

export function egressHostAllowlistFromEnv(): string[] {
  return parseHostAllowlist(process.env.PILOX_EGRESS_FETCH_HOST_ALLOWLIST);
}

/** True if acceptable for egress when enforcing “public only” (no allowlist). */
export function isPublicUnicastIp(ip: string): boolean {
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
      return isPublicUnicastIp(v4);
    }
    return true;
  }
  return false;
}

function hostMatchesAllowlist(host: string, allow: string[]): boolean {
  const h = host.toLowerCase();
  return allow.some((a) => h === a || h.endsWith(`.${a}`));
}

async function dnsResolvesAcceptably(
  hostname: string,
  allowPrivateResolution: boolean,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const addrs = await dns.lookup(hostname, { all: true, verbatim: true });
    if (!addrs.length) return { ok: false, reason: "dns_no_results" };
    for (const a of addrs) {
      if (!isPublicUnicastIp(a.address)) {
        if (!allowPrivateResolution) {
          return { ok: false, reason: `dns_private:${a.address}` };
        }
      }
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `dns_error:${msg}` };
  }
}

export type EgressUrlGateResult =
  | { ok: true; url: string }
  | { ok: false; reason: string };

/**
 * Validate URL before fetch. Uses env allowlist when set; otherwise public-IP-only for hostnames.
 */
export async function assertUrlSafeForEgressFetch(
  urlString: string,
  opts?: { hostAllowlist?: string[] },
): Promise<EgressUrlGateResult> {
  let u: URL;
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

  const allow =
    opts?.hostAllowlist ?? (await getMergedEgressHostAllowlist());
  const host = u.hostname;

  if (allow.length > 0) {
    if (!hostMatchesAllowlist(host, allow)) {
      return { ok: false, reason: "host_not_allowlisted" };
    }
  }

  const allowPrivate =
    allow.length > 0 && hostMatchesAllowlist(host, allow);

  if (net.isIP(host)) {
    if (!isPublicUnicastIp(host)) {
      if (!allowPrivate) return { ok: false, reason: "literal_private_ip" };
    }
    return { ok: true, url: u.href };
  }

  const dr = await dnsResolvesAcceptably(host, allowPrivate);
  if (!dr.ok) return dr;
  return { ok: true, url: u.href };
}

export type FetchTextSsrfResult =
  | { ok: true; text: string; finalUrl: string }
  | { ok: false; error: string };

/**
 * GET URL with manual redirect handling and per-hop SSRF checks. Enforces max body size after read.
 */
export async function fetchTextWithSsrfGuard(
  urlString: string,
  opts: {
    timeoutMs: number;
    maxBytes: number;
    headers?: Record<string, string>;
    hostAllowlist?: string[];
  },
): Promise<FetchTextSsrfResult> {
  let current = urlString;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), opts.timeoutMs);
  const maxHops = maxRedirects();

  try {
    for (let hop = 0; hop <= maxHops; hop++) {
      const gate = await assertUrlSafeForEgressFetch(current, {
        hostAllowlist: opts.hostAllowlist,
      });
      if (!gate.ok) {
        return { ok: false, error: `ssrf:${gate.reason}` };
      }
      const target = gate.url;
      const r = await fetch(target, {
        signal: ac.signal,
        redirect: "manual",
        headers: opts.headers ?? {},
      });

      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get("location");
        if (!loc) return { ok: false, error: "redirect_missing_location" };
        current = new URL(loc, target).href;
        continue;
      }

      if (!r.ok) {
        return { ok: false, error: `HTTP ${r.status}` };
      }

      const text = await r.text();
      if (text.length > opts.maxBytes) {
        return {
          ok: false,
          error: `body_too_large:${text.length}>${opts.maxBytes}`,
        };
      }
      return { ok: true, text, finalUrl: target };
    }
    return { ok: false, error: "too_many_redirects" };
  } catch (e) {
    const msg =
      e instanceof Error && e.name === "AbortError"
        ? "timeout"
        : e instanceof Error
          ? e.message
          : String(e);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(t);
  }
}

export type PostJsonSsrfResult =
  | { ok: true; status: number; bodyText: string }
  | { ok: false; error: string };

/**
 * POST JSON to a URL with SSRF gate and **no redirects** (redirect → TypeError / failed fetch).
 * Use for webhooks and operator-configured callbacks.
 */
export async function postJsonWithSsrfGuard(
  urlString: string,
  jsonBody: unknown,
  opts: {
    timeoutMs: number;
    maxResponseBytes: number;
    headers?: Record<string, string>;
    hostAllowlist?: string[];
  },
): Promise<PostJsonSsrfResult> {
  const gate = await assertUrlSafeForEgressFetch(urlString, {
    hostAllowlist: opts.hostAllowlist,
  });
  if (!gate.ok) return { ok: false, error: `ssrf:${gate.reason}` };

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), opts.timeoutMs);
  try {
    const r = await fetch(gate.url, {
      method: "POST",
      signal: ac.signal,
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        ...opts.headers,
      },
      body: JSON.stringify(jsonBody),
    });
    const bodyText = await r.text();
    if (bodyText.length > opts.maxResponseBytes) {
      return {
        ok: false,
        error: `response_too_large:${bodyText.length}>${opts.maxResponseBytes}`,
      };
    }
    return { ok: true, status: r.status, bodyText };
  } catch (e) {
    const msg =
      e instanceof Error && e.name === "AbortError"
        ? "timeout"
        : e instanceof Error
          ? e.message
          : String(e);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(t);
  }
}
