/** Characters allowed in JSON-RPC method names on the public allowlist (defensive). */
const METHOD_SEGMENT = /^[a-zA-Z0-9._/-]+$/;

const MAX_METHODS = 32;
const MAX_METHOD_LEN = 128;

/**
 * Parse env allowlist: comma-separated, trimmed, deduped, invalid segments dropped.
 */
export function parsePublicA2aAllowedMethods(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const m = part.trim().slice(0, MAX_METHOD_LEN);
    if (!m || m.length > MAX_METHOD_LEN) continue;
    if (!METHOD_SEGMENT.test(m)) continue;
    if (seen.has(m)) continue;
    seen.add(m);
    out.push(m);
    if (out.length >= MAX_METHODS) break;
  }
  return out;
}

export function publicA2aAllowedMethodSet(
  raw: string | undefined
): ReadonlySet<string> {
  return getPublicA2aAllowedMethodSet(raw ?? "");
}

let cachedAllowed: { envRaw: string; set: ReadonlySet<string> } | null = null;

/** Cached by env string — `env()` is process-wide immutable between restarts. */
export function getPublicA2aAllowedMethodSet(envRaw: string): ReadonlySet<string> {
  if (cachedAllowed?.envRaw === envRaw) return cachedAllowed.set;
  const set = new Set(parsePublicA2aAllowedMethods(envRaw)) as ReadonlySet<string>;
  cachedAllowed = { envRaw, set };
  return set;
}

export function jsonRpcMethodFromBody(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const m = (body as { method?: unknown }).method;
  if (typeof m !== "string") return "";
  const t = m.trim().slice(0, MAX_METHOD_LEN);
  return METHOD_SEGMENT.test(t) ? t : "";
}
