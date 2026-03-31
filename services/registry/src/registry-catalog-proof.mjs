import { ed25519 } from "@noble/curves/ed25519";
import { stableStringify } from "./stable-stringify.mjs";

export const CATALOG_PROOF_TYPE = "hive-registry-catalog-ed25519-v1";
export const CATALOG_SCHEMA = "hive-registry-catalog-v1";

/**
 * @param {string} hex
 * @returns {Uint8Array}
 */
function hexToBytes(hex) {
  const t = hex.trim();
  if (t.length % 2 !== 0) throw new Error("bad_hex_length");
  const out = new Uint8Array(t.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(t.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * @param {Uint8Array} b
 * @returns {string}
 */
function bytesToHex(b) {
  return Buffer.from(b).toString("hex");
}

/**
 * Canonical payload signed for the public catalog listing.
 *
 * @param {string[]} handles
 * @param {string} issuedAt ISO-8601
 */
export function catalogSigningPayload(handles, issuedAt) {
  const sorted = [...handles].sort();
  return stableStringify({
    schema: CATALOG_SCHEMA,
    handles: sorted,
    issuedAt,
  });
}

/**
 * @param {string} signingKeyHex 32-byte Ed25519 seed (64 hex chars)
 * @param {string[]} handles
 * @param {string} issuedAt
 * @param {string} signingKid
 */
export function signCatalogListing(signingKeyHex, handles, issuedAt, signingKid) {
  const seed = hexToBytes(signingKeyHex);
  if (seed.length !== 32) throw new Error("catalog_signing_key_must_be_32_bytes");
  const pub = ed25519.getPublicKey(seed);
  const msg = new TextEncoder().encode(catalogSigningPayload(handles, issuedAt));
  const sig = ed25519.sign(msg, seed);
  return {
    type: CATALOG_PROOF_TYPE,
    issuedAt,
    signingKid,
    sigHex: bytesToHex(sig),
    publicKeyHex: bytesToHex(pub),
  };
}

/**
 * @param {unknown} body parsed JSON from GET /v1/records
 * @param {string} [expectedPubHex] if set, must match catalogProof.publicKeyHex
 * @returns {{ ok: true } | { ok: false; reason: string }}
 */
export function verifySignedCatalogResponse(body, expectedPubHex) {
  if (!body || typeof body !== "object") return { ok: false, reason: "bad_body" };
  const o = /** @type {Record<string, unknown>} */ (body);
  const handles = o.handles;
  if (!Array.isArray(handles)) return { ok: false, reason: "missing_handles" };
  for (const h of handles) {
    if (typeof h !== "string" || h.length < 8) return { ok: false, reason: "bad_handle_entry" };
  }
  const proof = o.catalogProof;
  if (!proof || typeof proof !== "object") return { ok: false, reason: "missing_catalog_proof" };
  const p = /** @type {Record<string, unknown>} */ (proof);
  if (p.type !== CATALOG_PROOF_TYPE) return { ok: false, reason: "bad_proof_type" };
  const issuedAt = p.issuedAt;
  if (typeof issuedAt !== "string" || !issuedAt.trim()) {
    return { ok: false, reason: "bad_issuedAt" };
  }
  const sigHex = p.sigHex;
  const pubHex = p.publicKeyHex;
  if (typeof sigHex !== "string" || !/^[0-9a-fA-F]{128}$/.test(sigHex)) {
    return { ok: false, reason: "bad_sig_hex" };
  }
  if (typeof pubHex !== "string" || !/^[0-9a-fA-F]{64}$/i.test(pubHex)) {
    return { ok: false, reason: "bad_pub_hex" };
  }
  if (expectedPubHex && expectedPubHex.trim().toLowerCase() !== pubHex.trim().toLowerCase()) {
    return { ok: false, reason: "pubkey_mismatch" };
  }
  const msg = new TextEncoder().encode(
    catalogSigningPayload(
      handles.map((x) => String(x)),
      issuedAt
    )
  );
  let sig;
  let pk;
  try {
    sig = hexToBytes(sigHex);
    pk = hexToBytes(pubHex);
  } catch {
    return { ok: false, reason: "invalid_hex" };
  }
  try {
    if (!ed25519.verify(sig, msg, pk)) return { ok: false, reason: "bad_signature" };
  } catch {
    return { ok: false, reason: "verify_error" };
  }
  return { ok: true };
}
