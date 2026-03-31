import { createHash, timingSafeEqual } from "crypto";
import { parsePublicA2aAllowedMethods } from "@/lib/a2a/public-jsonrpc-policy";

const KEY_PREFIX = "a2a:public_api:v1:";
const MAX_KEYS = 32;
const MIN_TOKEN_LEN = 32;
const MAX_TOKEN_LEN = 512;

export type PublicApiKeyEntry = {
  /** Raw secret material (from env); never logged. */
  token: string;
  /**
   * When non-null, only these methods are allowed for this key (must be ⊆ global allowlist).
   * When null, any method in `A2A_PUBLIC_JSONRPC_ALLOWED_METHODS` is allowed.
   */
  scopes: string[] | null;
};

/**
 * Split env string into entry segments.
 * - If a `|` appears anywhere, entries are separated by `;` (scopes use `,` inside).
 * - Otherwise comma-separated plain tokens (legacy).
 */
function splitKeyEntrySegments(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  if (t.includes("|")) {
    return t.split(";").map((s) => s.trim()).filter(Boolean);
  }
  return t.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseOneEntrySegment(seg: string): PublicApiKeyEntry | null {
  const firstBar = seg.indexOf("|");
  if (firstBar === -1) {
    const token = seg.trim();
    if (token.length < MIN_TOKEN_LEN || token.length > MAX_TOKEN_LEN) return null;
    return { token, scopes: null };
  }
  const token = seg.slice(0, firstBar).trim();
  const rest = seg.slice(firstBar + 1);
  if (token.length < MIN_TOKEN_LEN || token.length > MAX_TOKEN_LEN) return null;
  const scopes = parsePublicA2aAllowedMethods(rest);
  if (scopes.length === 0) return null;
  return { token, scopes };
}

/** Parse public API key entries (optional per-key method scopes). */
export function parsePublicA2aApiKeyEntries(raw: string): PublicApiKeyEntry[] {
  const seen = new Set<string>();
  const out: PublicApiKeyEntry[] = [];
  for (const seg of splitKeyEntrySegments(raw)) {
    const ent = parseOneEntrySegment(seg);
    if (!ent) continue;
    if (seen.has(ent.token)) continue;
    seen.add(ent.token);
    out.push(ent);
    if (out.length >= MAX_KEYS) break;
  }
  return out;
}

/** @deprecated Use parsePublicA2aApiKeyEntries — returns raw tokens only. */
export function parsePublicA2aApiKeys(raw: string): string[] {
  return parsePublicA2aApiKeyEntries(raw).map((e) => e.token);
}

export function hashPublicApiKeyMaterial(token: string): string {
  return createHash("sha256")
    .update(`${KEY_PREFIX}${token}`, "utf8")
    .digest("hex");
}

/**
 * Prefer dedicated header to avoid clashing with Pilox `Authorization: Bearer` (API tokens / sessions).
 */
export function extractPublicApiKeyCandidate(req: Request): string | null {
  const h = req.headers.get("x-pilox-public-a2a-key");
  if (h != null) {
    const t = h.trim();
    if (t.length >= MIN_TOKEN_LEN && t.length <= MAX_TOKEN_LEN) return t;
    return null;
  }

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const t = auth.slice("Bearer ".length).trim();
    if (t.length >= MIN_TOKEN_LEN && t.length <= MAX_TOKEN_LEN) return t;
  }
  return null;
}

/** Timing-safe match; returns hash + optional scopes for this key. */
export function matchPublicA2aApiKey(
  provided: string,
  entries: PublicApiKeyEntry[]
): { hash: string; scopes: string[] | null } | null {
  const p = provided.trim();
  if (!p || entries.length === 0) return null;
  const pb = Buffer.from(p, "utf8");
  if (pb.length !== p.length) return null;
  for (const ent of entries) {
    const k = ent.token;
    if (k.length !== p.length) continue;
    const kb = Buffer.from(k, "utf8");
    if (kb.length !== k.length) continue;
    try {
      if (timingSafeEqual(pb, kb)) {
        return { hash: hashPublicApiKeyMaterial(p), scopes: ent.scopes };
      }
    } catch {
      /* length mismatch in timingSafeEqual */
    }
  }
  return null;
}
