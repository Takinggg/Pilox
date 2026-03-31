/** How Pilox derives the client IP for rate limits, federation allowlist, and audit. */
export type PiloxClientIpSource = "auto" | "real_ip" | "xff_first" | "xff_last";

const MAX_LEN = 200;

/** IPv4 dotted quad or compact IPv6 (no full validation — length + charset). */
export function isPlausibleIp(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 3 || t.length > 200) return false;
  if (t.includes("..") || t.includes(":::")) return false;
  if (/^[\d.]+$/.test(t)) {
    const parts = t.split(".");
    return (
      parts.length === 4 &&
      parts.every((p) => {
        const n = Number(p);
        return p !== "" && Number.isInteger(n) && n >= 0 && n <= 255;
      })
    );
  }
  if (t.includes(":")) {
    return /^[0-9a-fA-F:.]+$/.test(t);
  }
  return false;
}

export function parsePiloxClientIpSource(
  raw: string | undefined
): PiloxClientIpSource {
  const v = (raw ?? "auto").trim().toLowerCase();
  if (
    v === "real_ip" ||
    v === "xff_first" ||
    v === "xff_last" ||
    v === "auto"
  ) {
    return v;
  }
  return "auto";
}

function clamp(s: string): string {
  const t = s.trim();
  if (!t) return "unknown";
  return t.slice(0, MAX_LEN);
}

function xffParts(get: (name: string) => string | null | undefined): string[] {
  const xff = get("x-forwarded-for");
  if (!xff || typeof xff !== "string") return [];
  return xff
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param useMiddlewareSetClientIp When false (e.g. Next middleware before `x-client-ip` exists),
 *   `auto` skips `x-client-ip` and uses XFF / X-Real-IP only.
 */
export function resolveClientIpFromHeaderGetter(
  get: (name: string) => string | null | undefined,
  source: PiloxClientIpSource,
  opts?: { useMiddlewareSetClientIp?: boolean }
): string {
  const useXci = opts?.useMiddlewareSetClientIp !== false;
  const parts = xffParts(get);

  switch (source) {
    case "real_ip": {
      const r = get("x-real-ip")?.trim();
      return r && isPlausibleIp(r) ? clamp(r) : "unknown";
    }
    case "xff_first": {
      const first = parts[0];
      return first ? clamp(first) : "unknown";
    }
    case "xff_last": {
      const last = parts.length ? parts[parts.length - 1] : "";
      return last ? clamp(last) : "unknown";
    }
    case "auto":
    default: {
      // Prefer x-client-ip set by our own middleware (already extracted safely)
      if (useXci) {
        const xc = get("x-client-ip")?.trim();
        if (xc && xc !== "unknown") return clamp(xc);
      }
      // X-Real-IP is typically set by a trusted reverse proxy (Nginx, Traefik)
      // and is harder to spoof than XFF — prefer it over raw XFF.
      const r = get("x-real-ip")?.trim();
      if (r && isPlausibleIp(r)) return clamp(r);
      // Fall back to XFF only after X-Real-IP (XFF is easily spoofed without a
      // trusted proxy that strips client-supplied values)
      if (parts[0] && isPlausibleIp(parts[0])) return clamp(parts[0]);
      return "unknown";
    }
  }
}

export function resolveClientIpFromRequest(
  req: Request,
  source: PiloxClientIpSource,
  opts?: { useMiddlewareSetClientIp?: boolean }
): string {
  return resolveClientIpFromHeaderGetter(
    (n) => req.headers.get(n),
    source,
    opts
  );
}
