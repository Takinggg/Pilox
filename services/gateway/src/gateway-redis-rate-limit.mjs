/**
 * Optional Redis-backed sliding-window rate limit (shared across gateway replicas).
 * When `GATEWAY_RATE_LIMIT_REDIS_URL` is unset, returns null and callers use in-memory buckets.
 */
import Redis from "ioredis";

/** @type {Redis | null} */
let client = null;

/**
 * @returns {Redis | null}
 */
export function getGatewayRateLimitRedis() {
  const url = (process.env.GATEWAY_RATE_LIMIT_REDIS_URL ?? "").trim();
  if (!url) return null;
  if (!client) {
    client = new Redis(url, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });
    client.on("error", (err) => {
      console.error("[gateway] redis rate-limit error:", err.message);
    });
  }
  return client;
}

/**
 * @param {Redis} r
 * @param {string} key
 * @param {number} windowMs
 * @param {number} maxRequests
 * @returns {Promise<boolean>} true if allowed
 */
async function slidingWindowAllow(r, key, windowMs, maxRequests) {
  const now = Date.now();
  const windowStart = now - windowMs;
  const member = `${now}:${Math.random().toString(36).slice(2)}`;
  const pipeline = r.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now, member);
  pipeline.zcard(key);
  pipeline.pexpire(key, windowMs);
  const results = await pipeline.exec();
  const count = /** @type {number} */ (results?.[2]?.[1] ?? 0);
  return count <= maxRequests;
}

/**
 * @param {string} ip
 * @param {number} maxPerWindow
 * @param {number} windowMs
 * @returns {Promise<boolean | null>} null = Redis unavailable, caller should fall back
 */
export async function rateAllowRedis(ip, maxPerWindow, windowMs) {
  const r = getGatewayRateLimitRedis();
  if (!r) return null;
  try {
    if (r.status !== "ready") await r.connect();
    const safeIp = ip.replace(/[^a-zA-Z0-9.:_-]/g, "_").slice(0, 200);
    const key = `hive:gw:rl:${safeIp}`;
    return await slidingWindowAllow(r, key, windowMs, maxPerWindow);
  } catch (e) {
    console.error(
      "[gateway] redis rate-limit check failed:",
      e instanceof Error ? e.message : e
    );
    return null;
  }
}
