import { createRedisPerMinuteLimiter } from "./registry-redis-minute-rate.mjs";

/**
 * @param {string} redisUrl
 * @param {number} perMin
 */
export function createRedisWriteRateLimiter(redisUrl, perMin) {
  return createRedisPerMinuteLimiter(redisUrl, perMin, "wr");
}
