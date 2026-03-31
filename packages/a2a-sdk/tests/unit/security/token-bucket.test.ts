import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenBucket } from '../../../src/security/rate-limit/token-bucket.js';

describe('TokenBucket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests within limit', () => {
    const bucket = new TokenBucket({ maxRequests: 5, windowMs: 1000 });

    for (let i = 0; i < 5; i++) {
      const result = bucket.consume('agent-1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4 - i);
    }
  });

  it('rejects requests over limit', () => {
    const bucket = new TokenBucket({ maxRequests: 3, windowMs: 1000 });

    bucket.consume('agent-1');
    bucket.consume('agent-1');
    bucket.consume('agent-1');

    const result = bucket.consume('agent-1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('refills tokens over time', () => {
    const bucket = new TokenBucket({ maxRequests: 2, windowMs: 1000 });

    bucket.consume('agent-1');
    bucket.consume('agent-1');

    // Move time forward by half the window
    vi.advanceTimersByTime(500);

    const result = bucket.consume('agent-1');
    expect(result.allowed).toBe(true);
  });

  it('tracks different keys independently', () => {
    const bucket = new TokenBucket({ maxRequests: 1, windowMs: 1000 });

    const r1 = bucket.consume('agent-1');
    expect(r1.allowed).toBe(true);

    const r2 = bucket.consume('agent-2');
    expect(r2.allowed).toBe(true);

    // agent-1 is now rate limited
    const r3 = bucket.consume('agent-1');
    expect(r3.allowed).toBe(false);
  });

  it('resets a specific key', () => {
    const bucket = new TokenBucket({ maxRequests: 1, windowMs: 60000 });

    bucket.consume('agent-1');
    expect(bucket.consume('agent-1').allowed).toBe(false);

    bucket.reset('agent-1');
    expect(bucket.consume('agent-1').allowed).toBe(true);
  });

  it('uses default config values', () => {
    const bucket = new TokenBucket();
    const result = bucket.consume('agent-1');
    expect(result.limit).toBe(100);
    expect(result.allowed).toBe(true);
  });
});
