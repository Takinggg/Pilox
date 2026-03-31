import type { RateLimitConfig } from '../../config/types.js';
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
export declare class TokenBucket {
    private readonly maxRequests;
    private readonly windowMs;
    private readonly buckets;
    constructor(config?: RateLimitConfig);
    /**
     * Check if a request from the given key is allowed.
     * Consumes one token if allowed.
     */
    consume(key: string): RateLimitResult;
    /** Reset a specific key's bucket */
    reset(key: string): void;
    /** Clear all buckets */
    clear(): void;
}
//# sourceMappingURL=token-bucket.d.ts.map