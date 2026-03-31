// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Per-agent rate limiting using Redis sliding window.
 *
 * Two independent limiters:
 * - rateLimitRequestsPerMin  — limits total requests per minute.
 * - rateLimitTokensPerMin    — limits total tokens per minute.
 */

import { getRedis } from "./redis";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("rate-limiter");

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfterMs?: number;
}

/**
 * Check per-agent request rate limit (sliding window via Redis).
 * Fail-open: if Redis is unavailable, the request is allowed.
 */
export async function checkRequestRateLimit(
  agentId: string,
  maxRequestsPerMin: number | undefined,
): Promise<RateLimitResult> {
  if (!maxRequestsPerMin || maxRequestsPerMin <= 0) {
    return { allowed: true };
  }

  try {
    const redis = getRedis();
    const now = Date.now();
    const windowMs = 60_000;
    const key = `pilox:rl:req:${agentId}`;

    // Sliding window: remove entries older than 1 minute, add current, count
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, now - windowMs);
    pipeline.zadd(key, now, `${now}:${Math.random().toString(36).slice(2, 8)}`);
    pipeline.zcard(key);
    pipeline.expire(key, 120); // 2-min TTL as safety net

    const results = await pipeline.exec();
    const count = (results?.[2]?.[1] as number) ?? 0;

    if (count > maxRequestsPerMin) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${count}/${maxRequestsPerMin} requests per minute`,
        retryAfterMs: windowMs,
      };
    }

    return { allowed: true };
  } catch (err) {
    log.warn("rate_limiter.redis_error", {
      agentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { allowed: true }; // fail-open
  }
}

/**
 * Check per-agent token rate limit (sliding window counter via Redis).
 * Called AFTER a response to enforce token-based throttling for next request.
 * Fail-open: if Redis is unavailable, the request is allowed.
 */
export async function checkTokenRateLimit(
  agentId: string,
  maxTokensPerMin: number | undefined,
): Promise<RateLimitResult> {
  if (!maxTokensPerMin || maxTokensPerMin <= 0) {
    return { allowed: true };
  }

  try {
    const redis = getRedis();
    const now = Date.now();
    const windowMs = 60_000;
    const key = `pilox:rl:tok:${agentId}`;

    // Get the current counter value for the sliding window
    const raw = await redis.get(key);
    const current = parseInt(raw ?? "0", 10);

    if (current >= maxTokensPerMin) {
      // Find TTL to know when the window resets
      const ttl = await redis.pttl(key);
      return {
        allowed: false,
        reason: `Token rate limit exceeded: ${current}/${maxTokensPerMin} tokens per minute`,
        retryAfterMs: ttl > 0 ? ttl : windowMs,
      };
    }

    return { allowed: true };
  } catch (err) {
    log.warn("rate_limiter.token_check_redis_error", {
      agentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { allowed: true }; // fail-open
  }
}

/**
 * Record token usage for rate limiting. Called after a response completes.
 * Uses a simple Redis counter with 60-second TTL.
 */
export async function recordTokenUsageForRateLimit(
  agentId: string,
  tokens: number,
): Promise<void> {
  if (tokens <= 0) return;

  try {
    const redis = getRedis();
    const key = `pilox:rl:tok:${agentId}`;

    const pipeline = redis.pipeline();
    pipeline.incrby(key, tokens);
    pipeline.expire(key, 60); // 1-minute window
    await pipeline.exec();
  } catch {
    // Non-fatal — metering is best-effort
  }
}
