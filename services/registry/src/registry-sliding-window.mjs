const WINDOW_MS = 60_000;

/**
 * In-memory sliding window rate limit (same model as mesh gateway stub).
 *
 * @param {Map<string, number[]>} buckets
 * @param {string} key
 * @param {number} perMin max requests per window; 0 = unlimited
 * @returns {boolean}
 */
export function rateAllowSliding(buckets, key, perMin) {
  if (perMin <= 0) return true;
  const now = Date.now();
  const arr = buckets.get(key) ?? [];
  const pruned = arr.filter((t) => now - t < WINDOW_MS);
  if (pruned.length >= perMin) return false;
  pruned.push(now);
  buckets.set(key, pruned);
  return true;
}
