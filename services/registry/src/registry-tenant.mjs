/** Multi-tenant storage keys: logical handle in URLs; internal key = tenant + SEP + handle when enabled. */

const SEP = "\x1f";

const TENANT_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

/**
 * @param {string | undefined} raw
 * @returns {{ ok: true; id: string } | { ok: false; reason: string }}
 */
export function normalizeTenantId(raw) {
  const t = (raw ?? "").trim();
  if (!t) return { ok: false, reason: "tenant_required" };
  if (t.length > 64) return { ok: false, reason: "tenant_too_long" };
  if (!TENANT_RE.test(t)) return { ok: false, reason: "tenant_invalid" };
  if (t.includes(SEP)) return { ok: false, reason: "tenant_invalid_char" };
  return { ok: true, id: t };
}

/**
 * @param {boolean} multiTenant
 * @param {string} tenantId normalized or "" when MT off
 * @param {string} logicalHandle
 */
export function makeStorageKey(multiTenant, tenantId, logicalHandle) {
  if (!multiTenant || !tenantId) return logicalHandle;
  return `${tenantId}${SEP}${logicalHandle}`;
}

/**
 * @param {boolean} multiTenant
 * @param {string} storageKey
 * @returns {{ tenantId: string; logicalHandle: string }}
 */
export function parseStorageKey(multiTenant, storageKey) {
  if (!multiTenant || !storageKey.includes(SEP)) {
    return { tenantId: "", logicalHandle: storageKey };
  }
  const i = storageKey.indexOf(SEP);
  return {
    tenantId: storageKey.slice(0, i),
    logicalHandle: storageKey.slice(i + 1),
  };
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {string} headerName case-insensitive
 * @param {boolean} multiTenant
 * @returns {{ ok: true; tenantId: string } | { ok: false; reason: string }}
 */
export function tenantFromRequest(req, headerName, multiTenant) {
  if (!multiTenant) return { ok: true, tenantId: "" };
  const raw = req.headers[headerName.toLowerCase()];
  const v = Array.isArray(raw) ? raw[0] : raw;
  return normalizeTenantId(typeof v === "string" ? v : "");
}

/**
 * @param {boolean} multiTenant
 * @param {string} tenantId
 * @param {Map<string, object>} store
 * @returns {string[]} logical handles for tenant
 */
export function listLogicalHandlesForTenant(multiTenant, tenantId, store) {
  if (!multiTenant) return [...store.keys()];
  const prefix = `${tenantId}${SEP}`;
  const out = [];
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) out.push(k.slice(prefix.length));
  }
  return out.sort();
}

/**
 * @param {boolean} multiTenant
 * @param {string} tenantId
 * @param {string} agentCardUrl
 * @param {Map<string, object>} store
 * @returns {string[]}
 */
export function resolveHandlesForCard(multiTenant, tenantId, agentCardUrl, store) {
  const handles = [];
  if (!multiTenant) {
    for (const [h, rec] of store) {
      if (rec?.agentCardUrl === agentCardUrl) handles.push(h);
    }
    return handles;
  }
  const prefix = `${tenantId}${SEP}`;
  for (const [sk, rec] of store) {
    if (!sk.startsWith(prefix)) continue;
    if (rec?.agentCardUrl === agentCardUrl) {
      handles.push(sk.slice(prefix.length));
    }
  }
  return handles;
}
