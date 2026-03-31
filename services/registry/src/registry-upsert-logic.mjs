/**
 * Pure upsert rules for authenticated registry writes.
 */

/**
 * @param {object | undefined} existing
 * @param {object} incoming
 * @param {{ rejectStale: boolean }} opts
 * @returns
 *   | { ok: true }
 *   | { ok: false; status: number; error: string }
 */
export function decideUpsert(existing, incoming, opts) {
  const h = incoming?.handle;
  if (typeof h !== "string" || h.length < 8) {
    return { ok: false, status: 400, error: "invalid_handle" };
  }
  const nextTs = Date.parse(incoming.updatedAt);
  if (Number.isNaN(nextTs)) {
    return { ok: false, status: 400, error: "invalid_updatedAt" };
  }
  if (opts.rejectStale && existing) {
    const curTs = Date.parse(existing.updatedAt);
    if (!Number.isNaN(curTs) && nextTs < curTs) {
      return { ok: false, status: 409, error: "stale_updatedAt" };
    }
  }
  return { ok: true };
}
