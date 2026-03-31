import { createHash } from "node:crypto";
import { stableStringify } from "./stable-stringify.mjs";

/**
 * Weak ETag over canonical record bytes (stable key order).
 * @param {object} rec
 */
export function recordWeakEtag(rec) {
  const hex = createHash("sha256")
    .update(stableStringify(rec))
    .digest("hex")
    .slice(0, 32);
  return `W/"${hex}"`;
}

/**
 * @param {string} raw
 */
function stripEtagToken(raw) {
  let x = raw.trim();
  if (/^W\//i.test(x)) x = x.slice(2);
  x = x.replace(/^"+|"+$/g, "");
  return x.toLowerCase();
}

/**
 * If-None-Match: client has cached body — return 304 when any token matches.
 * @param {string | undefined} ifNoneMatch
 * @param {string} etag
 */
export function etagNotModified(ifNoneMatch, etag) {
  if (ifNoneMatch === undefined || ifNoneMatch === null) return false;
  if (typeof ifNoneMatch !== "string" || !ifNoneMatch.trim()) return false;
  const want = stripEtagToken(etag);
  for (const part of ifNoneMatch.split(",")) {
    const t = stripEtagToken(part);
    if (t === "*" || t === want) return true;
  }
  return false;
}

/**
 * If-Match for optimistic concurrency on PUT/POST update.
 * @param {string | undefined} ifMatchHeader
 * @param {string} currentEtag
 */
export function ifMatchValidForUpdate(ifMatchHeader, currentEtag) {
  if (ifMatchHeader === undefined || ifMatchHeader === null) return false;
  if (typeof ifMatchHeader !== "string" || !ifMatchHeader.trim()) return false;
  const want = stripEtagToken(currentEtag);
  for (const part of ifMatchHeader.split(",")) {
    const t = stripEtagToken(part);
    if (t === "*" || t === want) return true;
  }
  return false;
}
