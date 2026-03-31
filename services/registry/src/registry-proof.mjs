import { ed25519 } from "@noble/curves/ed25519";
import { stableStringify } from "./stable-stringify.mjs";

const PROOF_TYPE = "hive-registry-record-ed25519-v1";

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
 * Cryptographic proof for `hive-registry-record-v1` when `proof.sigHex` is set.
 * Message = stableStringify({ schema, handle, updatedAt, agentCardUrl }) UTF-8.
 * Public key = `publicKeys.ed25519` entry whose `kid` matches `proof.signingKid`.
 *
 * @param {Record<string, unknown>} rec
 * @returns {{ ok: true } | { ok: false; reason: string }}
 */
export function verifyRegistryRecordProof(rec) {
  const proof = rec.proof;
  if (!proof || typeof proof !== "object") return { ok: true };
  const sigHex = proof.sigHex;
  if (sigHex === undefined || sigHex === null || sigHex === "") {
    return { ok: true };
  }
  if (typeof sigHex !== "string" || !/^[0-9a-fA-F]{128}$/.test(sigHex)) {
    return { ok: false, reason: "invalid_sig_hex" };
  }
  if (proof.type !== PROOF_TYPE) {
    return { ok: false, reason: "unsupported_proof_type" };
  }
  const kid = proof.signingKid;
  if (typeof kid !== "string" || !kid.trim()) {
    return { ok: false, reason: "missing_signing_kid" };
  }
  const ed = rec.publicKeys?.ed25519;
  if (!Array.isArray(ed)) {
    return { ok: false, reason: "missing_ed25519_public_keys" };
  }
  const entry = ed.find((k) => k && k.kid === kid);
  const pkHex = entry?.publicKeyHex;
  if (typeof pkHex !== "string" || !/^[0-9a-fA-F]{64}$/i.test(pkHex)) {
    return { ok: false, reason: "signing_kid_not_in_public_keys" };
  }
  const payload = {
    schema: rec.schema,
    handle: rec.handle,
    updatedAt: rec.updatedAt,
    agentCardUrl: rec.agentCardUrl,
  };
  const msg = new TextEncoder().encode(stableStringify(payload));
  let sig;
  let pk;
  try {
    sig = hexToBytes(sigHex);
    pk = hexToBytes(pkHex);
  } catch {
    return { ok: false, reason: "invalid_hex" };
  }
  if (sig.length !== 64) return { ok: false, reason: "bad_signature_length" };
  try {
    if (!ed25519.verify(sig, msg, pk)) {
      return { ok: false, reason: "bad_signature" };
    }
  } catch {
    return { ok: false, reason: "verify_error" };
  }
  return { ok: true };
}
