import Redis from "ioredis";

/**
 * Fixed-window per-minute counter in Redis (shared across replicas).
 *
 * @param {string} redisUrl
 * @param {number} perMin
 * @param {string} namespace segment for key (e.g. "wr", "rd")
 */
export function createRedisPerMinuteLimiter(redisUrl, perMin, namespace) {
  const safeNs = String(namespace).replace(/[^a-z0-9_-]/gi, "").slice(0, 16) || "x";
  const r = new Redis(redisUrl, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  return {
    perMin,
    /**
     * @param {string} ip
     * @returns {Promise<boolean>}
     */
    async allow(ip) {
      const safe = Buffer.from(ip, "utf8").toString("base64url").slice(0, 128);
      const window = Math.floor(Date.now() / 60_000);
      const key = `hive:registry:rl:${safeNs}:${safe}:${window}`;
      const n = await r.incr(key);
      if (n === 1) await r.expire(key, 120);
      return n <= perMin;
    },
    async quit() {
      await r.quit();
    },
  };
}
