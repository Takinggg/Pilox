// SPDX-License-Identifier: BUSL-1.1
import { createHmac, timingSafeEqual } from "node:crypto";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("mesh-wan-envelope-signer");

/**
 * Sign a WAN envelope payload with HMAC-SHA256.
 * Uses MESH_BUS_HMAC_SECRET for signing.
 */
export function signWanEnvelope(payload: string): string {
  const secret = process.env.MESH_BUS_HMAC_SECRET;
  if (!secret) {
    log.warn("wan_envelope_unsigned", { msg: "MESH_BUS_HMAC_SECRET not set — envelope will not be signed" });
    return "";
  }
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Verify a signed WAN envelope.
 * Returns true if the signature is valid.
 */
export function verifyWanEnvelopeSignature(payload: string, signature: string): boolean {
  const secret = process.env.MESH_BUS_HMAC_SECRET;
  if (!secret) {
    log.warn("wan_envelope_verify_skip", { msg: "MESH_BUS_HMAC_SECRET not set — cannot verify signature" });
    return false;
  }
  if (!signature) return false;

  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}

/**
 * Create a signed envelope wrapper.
 * Adds `_sig` field with HMAC-SHA256 signature of the JSON payload.
 */
export function createSignedEnvelope<T extends Record<string, unknown>>(
  envelope: T,
): T & { _sig: string; _sigAlg: string } {
  const payload = JSON.stringify(envelope);
  const sig = signWanEnvelope(payload);
  return {
    ...envelope,
    _sig: sig,
    _sigAlg: sig ? "hmac-sha256" : "none",
  };
}

/**
 * Verify and unwrap a signed envelope.
 * Returns the envelope without signature fields, or null if invalid.
 */
export function verifySignedEnvelope<T extends Record<string, unknown>>(
  signedEnvelope: T & { _sig?: string; _sigAlg?: string },
): T | null {
  const { _sig, _sigAlg, ...envelope } = signedEnvelope;

  // If no HMAC secret configured, accept unsigned envelopes (but log warning)
  if (!process.env.MESH_BUS_HMAC_SECRET) {
    log.debug("wan_envelope_no_hmac", { msg: "Accepting unsigned envelope (MESH_BUS_HMAC_SECRET not set)" });
    return envelope as T;
  }

  // If envelope is supposed to be signed but isn't
  if (!_sig || _sigAlg === "none") {
    log.warn("wan_envelope_unsigned_rejected", { msg: "Envelope has no signature but MESH_BUS_HMAC_SECRET is set" });
    return null;
  }

  const payload = JSON.stringify(envelope);
  if (!verifyWanEnvelopeSignature(payload, _sig)) {
    log.warn("wan_envelope_invalid_signature", { msg: "HMAC signature verification failed" });
    return null;
  }

  return envelope as T;
}
