// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { ed25519 } from "@noble/curves/ed25519";
import { stableStringify } from "@/lib/mesh-envelope";

const PROOF_TYPE = "pilox-registry-record-ed25519-v1";

function hexToBytes(hex: string): Uint8Array {
  const t = hex.trim();
  if (t.length % 2 !== 0) throw new Error("bad_hex_length");
  const out = new Uint8Array(t.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(t.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export type RegistryRecordProofResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Cryptographic proof for `pilox-registry-record-v1` when `proof.sigHex` is set.
 * Message = stableStringify({ schema, handle, updatedAt, agentCardUrl }) UTF-8.
 * Public key = `publicKeys.ed25519` entry whose `kid` matches `proof.signingKid`.
 *
 * Same contract as `Pilox market-place/src/registry/registry-proof.mjs`.
 */
export function verifyRegistryRecordProof(rec: Record<string, unknown>): RegistryRecordProofResult {
  const proof = rec.proof;
  if (!proof || typeof proof !== "object" || Array.isArray(proof)) return { ok: true };
  const proofObj = proof as Record<string, unknown>;
  const sigHex = proofObj.sigHex;
  if (sigHex === undefined || sigHex === null || sigHex === "") {
    return { ok: true };
  }
  if (typeof sigHex !== "string" || !/^[0-9a-fA-F]{128}$/.test(sigHex)) {
    return { ok: false, reason: "invalid_sig_hex" };
  }
  if (proofObj.type !== PROOF_TYPE) {
    return { ok: false, reason: "unsupported_proof_type" };
  }
  const kid = proofObj.signingKid;
  if (typeof kid !== "string" || !kid.trim()) {
    return { ok: false, reason: "missing_signing_kid" };
  }
  const pkRoot = rec.publicKeys;
  if (!pkRoot || typeof pkRoot !== "object" || Array.isArray(pkRoot)) {
    return { ok: false, reason: "missing_ed25519_public_keys" };
  }
  const ed = (pkRoot as Record<string, unknown>).ed25519;
  if (!Array.isArray(ed)) {
    return { ok: false, reason: "missing_ed25519_public_keys" };
  }
  const entry = ed.find(
    (k): k is Record<string, unknown> =>
      Boolean(k) && typeof k === "object" && !Array.isArray(k) && k.kid === kid,
  );
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
  let sig: Uint8Array;
  let pk: Uint8Array;
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
