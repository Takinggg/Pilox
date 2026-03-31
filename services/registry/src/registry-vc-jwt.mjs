/**
 * Optional W3C Verifiable Credentials as JWT (vc-jwt) verification for registry writes.
 * Uses JWKS from REGISTRY_VC_JWKS_URL (cached). Not a full VC data-model engine — JWT crypto + exp + iss checks.
 *
 * @see https://www.w3.org/TR/vc-data-model/#json-web-token
 */
import * as jose from "jose";

let jwksCache = /** @type {{ url: string; jwks: jose.JSONWebKeySet; at: number } | null} */ (null);
const JWKS_TTL_MS = 5 * 60 * 1000;

/**
 * @param {string} jwksUrl
 */
async function getJwks(jwksUrl) {
  const now = Date.now();
  if (
    jwksCache &&
    jwksCache.url === jwksUrl &&
    now - jwksCache.at < JWKS_TTL_MS
  ) {
    return jwksCache.jwks;
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(jwksUrl, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`JWKS HTTP ${res.status}`);
    }
    const jwks = /** @type {jose.JSONWebKeySet} */ (await res.json());
    jwksCache = { url: jwksUrl, jwks, at: now };
    return jwks;
  } finally {
    clearTimeout(t);
  }
}

/**
 * @param {object} opts
 * @param {string} opts.jwksUrl
 * @param {string} opts.jwt
 * @param {string[]} [opts.issuerAllowlist] lowercase iss values; empty = any iss in JWT
 * @param {string} [opts.controllerDid] if set, JWT sub (or opts.subjectClaim) must equal this
 * @param {string} [opts.subjectClaim] default sub
 * @returns {Promise<{ ok: true; payload: jose.JWTPayload } | { ok: false; reason: string }>}
 */
export async function verifyVcJwt(opts) {
  const {
    jwksUrl,
    jwt,
    issuerAllowlist = [],
    controllerDid,
    subjectClaim = "sub",
  } = opts;
  if (!jwt?.trim()) return { ok: false, reason: "vc_jwt_missing" };
  let jwks;
  try {
    jwks = await getJwks(jwksUrl);
  } catch (e) {
    return { ok: false, reason: "vc_jwks_fetch_failed" };
  }
  try {
    const JWKS = jose.createLocalJWKSet(jwks);
    const { payload } = await jose.jwtVerify(jwt.trim(), JWKS, {
      clockTolerance: 60,
    });
    const iss =
      typeof payload.iss === "string" ? payload.iss.toLowerCase() : "";
    if (issuerAllowlist.length > 0) {
      const allowed = issuerAllowlist.some((a) => iss === a.toLowerCase());
      if (!allowed) return { ok: false, reason: "vc_iss_not_allowed" };
    }
    const vcClaim = payload.vc;
    if (vcClaim == null) {
      return { ok: false, reason: "vc_claim_missing" };
    }
    if (controllerDid && controllerDid.length > 0) {
      const sub = payload[subjectClaim];
      if (typeof sub !== "string" || sub !== controllerDid) {
        return { ok: false, reason: "vc_sub_controller_mismatch" };
      }
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: "vc_jwt_verify_failed" };
  }
}
