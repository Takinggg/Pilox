import { getRedis } from "./redis";
import { recordMeshRateLimitObservation } from "./mesh-otel";

/**
 * Redis-based sliding window rate limiter.
 * Uses sorted sets to track requests within a time window.
 */

export type SlidingWindowRateLimitConfig = {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  /** If true, allow requests when Redis is unavailable (default: false = deny). */
  failOpen?: boolean;
};

const PRESETS = {
  /**
   * Login: 5 attempts per 15 minutes per IP in normal operation.
   * In CI, Playwright signs in many times from the same runner IP; use a generous ceiling so
   * E2E is not blocked by the production abuse window.
   */
  login: {
    windowMs: 15 * 60 * 1000,
    maxRequests: process.env.CI === "true" ? 50_000 : 5,
    keyPrefix: "pilox:rl:login",
  },
  /** Register: 3 attempts per hour per IP */
  register: { windowMs: 60 * 60 * 1000, maxRequests: 3, keyPrefix: "pilox:rl:register" },
  /** API: 120 requests per minute per user/IP (fail-open so Redis outage doesn't block all users) */
  api: { windowMs: 60 * 1000, maxRequests: 120, keyPrefix: "pilox:rl:api", failOpen: true },
  /** Secrets: 30 requests per minute (sensitive) */
  secrets: { windowMs: 60 * 1000, maxRequests: 30, keyPrefix: "pilox:rl:secrets" },
  /** Backup: 5 per hour (heavy operation) */
  backup: { windowMs: 60 * 60 * 1000, maxRequests: 5, keyPrefix: "pilox:rl:backup" },
  /** First-boot setup: 30 per hour per IP (abuse before admin exists) */
  setup: { windowMs: 60 * 60 * 1000, maxRequests: 30, keyPrefix: "pilox:rl:setup" },
  /** Health: 60/min per IP — generous for LB probes, blocks enumeration/abuse (fail-open so Redis outage doesn't block probes) */
  health: { windowMs: 60 * 1000, maxRequests: 60, keyPrefix: "pilox:rl:health", failOpen: true },
  /** Stripe Checkout session creation — 10/min per IP */
  billing_checkout: { windowMs: 60 * 1000, maxRequests: 10, keyPrefix: "pilox:rl:billing_checkout" },
  /** Stripe Customer Portal — 10/min per IP */
  billing_portal: { windowMs: 60 * 1000, maxRequests: 10, keyPrefix: "pilox:rl:billing_portal" },
  /** Public GET /api/marketplace/:handle/verify when PILOX_MARKETPLACE_VERIFY_PUBLIC=true */
  marketplace_verify_public: {
    windowMs: 60 * 1000,
    maxRequests: 30,
    keyPrefix: "pilox:rl:marketplace_verify_public",
    failOpen: true,
  },
  /** Public GET /api/marketplace and GET /api/marketplace/:handle when PILOX_PUBLIC_MARKETPLACE_CATALOG=true */
  marketplace_catalog_public: {
    windowMs: 60 * 1000,
    maxRequests: 60,
    keyPrefix: "pilox:rl:marketplace_catalog_public",
    failOpen: true,
  },
} as const;

export type RateLimitPreset = keyof typeof PRESETS;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  limit: number;
}

/** Redis sliding-window limiter with an explicit key prefix (shared by presets and A2A middleware). */
export async function checkRateLimitWithConfig(
  identifier: string,
  config: SlidingWindowRateLimitConfig
): Promise<RateLimitResult> {
  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();

    const key = `${config.keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Sliding window: sorted set with timestamp scores
    const pipeline = r.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart); // remove expired
    pipeline.zadd(key, now, `${now}:${Math.random().toString(36).slice(2)}`);
    pipeline.zcard(key);
    pipeline.pexpire(key, config.windowMs);

    const results = await pipeline.exec();
    const count = (results?.[2]?.[1] as number) || 0;

    if (count > config.maxRequests) {
      // Over limit: calculate when the oldest request in window expires
      const oldest = await r.zrange(key, 0, 0, "WITHSCORES");
      const oldestTs = oldest.length >= 2 ? parseInt(oldest[1]) : now;
      const retryAfterMs = Math.max(1000, oldestTs + config.windowMs - now);

      const denied = {
        allowed: false,
        remaining: 0,
        retryAfterMs,
        limit: config.maxRequests,
      } as const;
      recordMeshRateLimitObservation(config.keyPrefix, denied);
      return denied;
    }

    const allowed = {
      allowed: true,
      remaining: Math.max(0, config.maxRequests - count),
      retryAfterMs: 0,
      limit: config.maxRequests,
    } as const;
    recordMeshRateLimitObservation(config.keyPrefix, allowed);
    return allowed;
  } catch (err) {
    const { createModuleLogger } = await import("@/lib/logger");
    const logger = createModuleLogger("rate-limit");

    if (config.failOpen) {
      logger.warn("Rate limit check failed (allowing request — failOpen)", {
        error: err instanceof Error ? err.message : String(err),
        identifier,
        keyPrefix: config.keyPrefix,
      });
      const allowed = {
        allowed: true,
        remaining: config.maxRequests,
        retryAfterMs: 0,
        limit: config.maxRequests,
      } as const;
      recordMeshRateLimitObservation(config.keyPrefix, allowed);
      return allowed;
    }

    logger.error("Rate limit check failed (denying request)", {
      error: err instanceof Error ? err.message : String(err),
      identifier,
      keyPrefix: config.keyPrefix,
    });
    const denied = {
      allowed: false,
      remaining: 0,
      retryAfterMs: 30_000,
      limit: config.maxRequests,
    } as const;
    recordMeshRateLimitObservation(config.keyPrefix, denied);
    return denied;
  }
}

export async function checkRateLimit(
  identifier: string,
  preset: RateLimitPreset
): Promise<RateLimitResult> {
  return checkRateLimitWithConfig(identifier, PRESETS[preset]);
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
  };
  if (!result.allowed) {
    headers["Retry-After"] = String(Math.ceil(result.retryAfterMs / 1000));
  }
  return headers;
}

export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: "Too many requests",
      retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        ...rateLimitHeaders(result),
      },
    }
  );
}
