import type { RateLimitConfig } from '../../config/types.js';

interface BucketState {
  tokens: number;
  lastRefill: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  limit: number;
}

/**
 * In-memory sliding-window token bucket rate limiter.
 * No external dependencies (no Redis).
 */
export class TokenBucket {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly buckets = new Map<string, BucketState>();

  constructor(config: RateLimitConfig = {}) {
    this.maxRequests = config.maxRequests ?? 100;
    this.windowMs = config.windowMs ?? 60_000;
  }

  /**
   * Check if a request from the given key is allowed.
   * Consumes one token if allowed.
   */
  consume(key: string): RateLimitResult {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.maxRequests, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const refillRate = this.maxRequests / this.windowMs;
    const refill = elapsed * refillRate;
    bucket.tokens = Math.min(this.maxRequests, bucket.tokens + refill);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        retryAfterMs: 0,
        limit: this.maxRequests,
      };
    }

    // Calculate when next token will be available
    const deficit = 1 - bucket.tokens;
    const retryAfterMs = Math.ceil(deficit / refillRate);

    return {
      allowed: false,
      remaining: 0,
      retryAfterMs,
      limit: this.maxRequests,
    };
  }

  /** Reset a specific key's bucket */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /** Clear all buckets */
  clear(): void {
    this.buckets.clear();
  }
}
