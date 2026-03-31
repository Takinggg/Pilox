/**
 * Optional HMAC over stable buyer-configuration payload (enterprise attestation).
 */

import crypto from "node:crypto";
import { stableStringify } from "./stable-stringify.mjs";

/**
 * @param {Record<string, unknown>} record
 * @param {string} secret
 * @returns {{ ok: true } | { ok: false; reason: string }}
 */
export function verifyPublishAttestationHmac(record, secret) {
  if (!secret || typeof secret !== "string") {
    return { ok: true };
  }
  const a = record.publishAttestation;
  if (!a || typeof a !== "object" || Array.isArray(a)) {
    return { ok: false, reason: "attestation_missing" };
  }
  const pa = /** @type {Record<string, unknown>} */ (a);
  const hex = pa.hmacSha256Hex;
  if (typeof hex !== "string" || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    return { ok: false, reason: "hmacSha256Hex_missing_or_invalid" };
  }
  const payload = stableStringify({
    handle: record.handle,
    updatedAt: record.updatedAt,
    buyerInputs: Array.isArray(record.buyerInputs) ? record.buyerInputs : [],
  });
  const mac = crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  const aBuf = Buffer.from(hex.toLowerCase(), "hex");
  const bBuf = Buffer.from(mac, "hex");
  if (aBuf.length !== bBuf.length || !crypto.timingSafeEqual(aBuf, bBuf)) {
    return { ok: false, reason: "hmac_mismatch" };
  }
  return { ok: true };
}
