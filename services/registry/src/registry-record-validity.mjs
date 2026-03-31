/**
 * Soft expiry via `validUntil` (ISO 8601) on hive-registry-record-v1.
 */

/**
 * @param {object} rec
 * @param {number} skewSec clock skew tolerance (positive = treat as still valid longer)
 */
export function isValidUntilExpired(rec, skewSec = 0) {
  const vu = rec?.validUntil;
  if (typeof vu !== "string" || !vu.trim()) return false;
  const t = Date.parse(vu);
  if (Number.isNaN(t)) return false;
  return t < Date.now() + skewSec * 1000;
}
