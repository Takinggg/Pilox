/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const RETRIES = Math.max(1, Math.min(10, Number(process.env.HIVE_WAN_INGEST_RETRIES) || 3));
const BASE_MS = Math.max(
  50,
  Math.min(30_000, Number(process.env.HIVE_WAN_INGEST_RETRY_BASE_MS) || 500)
);

/**
 * @param {string} url
 * @param {Record<string, string>} headers
 * @param {string} body
 * @returns {Promise<boolean>} true if HTTP 2xx
 */
export async function postWithRetries(url, headers, body) {
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body,
      });
      if (res.ok) return true;
      const retryable =
        res.status >= 502 || res.status === 429 || res.status === 408;
      if (!retryable || attempt === RETRIES - 1) {
        const t = await res.text();
        console.warn(
          "[mesh-wan-subscriber] hive ingest HTTP",
          res.status,
          t.slice(0, 240)
        );
        return false;
      }
    } catch (e) {
      if (attempt === RETRIES - 1) {
        console.warn("[mesh-wan-subscriber] hive ingest failed:", e?.message ?? e);
        return false;
      }
    }
    await sleep(BASE_MS * 2 ** attempt);
  }
  return false;
}
