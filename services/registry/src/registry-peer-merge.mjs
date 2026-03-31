import { verifyRegistryRecordProof } from "./registry-proof.mjs";

/**
 * Whether a record pulled from a peer should replace the local copy (same rules as HTTP merge).
 *
 * @param {object | undefined} existing
 * @param {object} rec remote record (already passed JSON Schema)
 * @param {{ syncVerifyProof: boolean }} opts
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function acceptPeerRecord(existing, rec, opts) {
  const nextTs = Date.parse(rec.updatedAt);
  if (Number.isNaN(nextTs)) return { ok: false, reason: "bad_updatedAt" };
  if (opts.syncVerifyProof) {
    const vr = verifyRegistryRecordProof(
      /** @type {Record<string, unknown>} */ (rec)
    );
    if (!vr.ok) return { ok: false, reason: vr.reason ?? "proof_failed" };
  }
  if (existing) {
    const curTs = Date.parse(existing.updatedAt);
    if (!Number.isNaN(curTs) && curTs >= nextTs) return { ok: false, reason: "not_newer" };
  }
  return { ok: true };
}
