import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { normalizeTenantId } from "./registry-tenant.mjs";

const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * @param {string} token
 */
export function hashInstanceToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** @returns {string} opaque bearer token (hex 64) */
export function generateInstanceToken() {
  return randomBytes(32).toString("hex");
}

/**
 * Slug segment: 1–128 chars, lowercase alnum + hyphen, no slashes.
 * @param {string} slug
 */
export function slugValid(slug) {
  if (typeof slug !== "string") return false;
  if (slug.length < 1 || slug.length > 128) return false;
  return SLUG_RE.test(slug);
}

/**
 * Record handle must be exactly `tenantKey/slug` for instance-scoped writes.
 * @param {string} fullHandle
 * @param {string} tenantKey
 */
export function handleOwnedByTenant(fullHandle, tenantKey) {
  if (typeof fullHandle !== "string" || typeof tenantKey !== "string") return false;
  const prefix = `${tenantKey}/`;
  if (!fullHandle.startsWith(prefix)) return false;
  const slug = fullHandle.slice(prefix.length);
  if (!slug || slug.includes("/")) return false;
  return slugValid(slug);
}

/**
 * @param {string} origin
 * @returns {{ ok: true; origin: string } | { ok: false; reason: string }}
 */
export function normalizeInstanceOrigin(origin) {
  if (typeof origin !== "string") return { ok: false, reason: "origin_invalid" };
  const t = origin.trim();
  if (t.length < 8 || t.length > 2048) return { ok: false, reason: "origin_invalid" };
  let u;
  try {
    u = new URL(t);
  } catch {
    return { ok: false, reason: "origin_invalid" };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "origin_must_be_https" };
  if (u.username || u.password) return { ok: false, reason: "origin_no_userinfo" };
  const canon = u.origin;
  return { ok: true, origin: canon };
}

/**
 * @param {string} token presented Bearer (utf8)
 * @param {string} storedHashHex sha256 hex from DB (64 chars)
 */
export function tokenMatchesStoredHash(token, storedHashHex) {
  if (typeof token !== "string" || typeof storedHashHex !== "string") return false;
  const computed = hashInstanceToken(token);
  const A = Buffer.from(computed, "hex");
  const B = Buffer.from(storedHashHex, "hex");
  if (A.length !== B.length || A.length !== 32) return false;
  return timingSafeEqual(A, B);
}

/**
 * @param {string} tenantRaw
 * @param {string} originRaw
 * @returns {{ ok: true; tenantKey: string; origin: string } | { ok: false; reason: string }}
 */
export function parseAdminCreateBody(tenantRaw, originRaw) {
  const tn = normalizeTenantId(tenantRaw);
  if (!tn.ok) return { ok: false, reason: tn.reason };
  const o = normalizeInstanceOrigin(originRaw);
  if (!o.ok) return { ok: false, reason: o.reason };
  return { ok: true, tenantKey: tn.id, origin: o.origin };
}
