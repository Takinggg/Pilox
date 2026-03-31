/**
 * Optional POST policies (PDP-lite) for operator-controlled registries.
 */

/**
 * @param {string | undefined} envVal
 * @returns {string[]}
 */
export function parseCommaList(envVal) {
  return (envVal ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {string} handle
 * @param {string[]} prefixes non-empty strings; if empty list, allow all
 * @returns {{ ok: true } | { ok: false; reason: string }}
 */
export function postHandleAllowed(handle, prefixes) {
  if (prefixes.length === 0) return { ok: true };
  if (typeof handle !== "string" || !handle.trim()) {
    return { ok: false, reason: "missing_handle" };
  }
  for (const p of prefixes) {
    if (handle.startsWith(p)) return { ok: true };
  }
  return { ok: false, reason: "handle_prefix_denied" };
}

/**
 * @param {string} agentCardUrl
 * @param {string[]} allowedHosts lowercased hostnames; if empty, allow all
 * @returns {{ ok: true } | { ok: false; reason: string }}
 */
const MAX_DHT_HINTS = 64;
const MAX_DHT_HINT_LEN = 2048;

/**
 * Operator-published DHT / rendezvous hints (multiaddr, https rendezvous URL, etc.).
 * @param {string | undefined} envVal
 * @returns {string[]}
 */
export function parseDhtBootstrapHints(envVal) {
  const out = [];
  for (const part of (envVal ?? "").split(",")) {
    const s = part.trim();
    if (!s || s.length > MAX_DHT_HINT_LEN) continue;
    out.push(s);
    if (out.length >= MAX_DHT_HINTS) break;
  }
  return out;
}

export function postAgentCardHostAllowed(agentCardUrl, allowedHosts) {
  if (allowedHosts.length === 0) return { ok: true };
  let u;
  try {
    u = new URL(agentCardUrl);
  } catch {
    return { ok: false, reason: "bad_agent_card_url" };
  }
  const host = u.hostname.toLowerCase();
  for (const h of allowedHosts) {
    if (host === h.toLowerCase()) return { ok: true };
  }
  return { ok: false, reason: "agent_card_host_denied" };
}
