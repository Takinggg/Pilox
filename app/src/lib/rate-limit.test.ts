import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Redis before importing rate-limit
vi.mock("./redis", () => {
  const store = new Map<string, { score: number; member: string }[]>();

  const mockRedis = {
    status: "ready",
    connect: vi.fn(),
    pipeline: () => {
      const ops: Array<() => [null, unknown]> = [];
      return {
        zremrangebyscore: (key: string, min: number, _max: number) => {
          ops.push(() => {
            const entries = store.get(key) || [];
            store.set(
              key,
              entries.filter((e) => e.score > _max)
            );
            return [null, 0];
          });
        },
        zadd: (key: string, score: number, member: string) => {
          ops.push(() => {
            const entries = store.get(key) || [];
            entries.push({ score, member });
            store.set(key, entries);
            return [null, 1];
          });
        },
        zcard: (key: string) => {
          ops.push(() => {
            return [null, (store.get(key) || []).length];
          });
        },
        pexpire: () => {
          ops.push(() => [null, 1]);
        },
        exec: async () => ops.map((op) => op()),
      };
    },
    zrange: async () => [],
  };

  return {
    getRedis: () => mockRedis,
  };
});

describe("rate-limit", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should allow requests under the limit", async () => {
    const { checkRateLimit } = await import("./rate-limit");
    const result = await checkRateLimit("test-ip", "api");

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
  });

  it("should return correct headers structure", async () => {
    const { rateLimitHeaders } = await import("./rate-limit");
    const headers = rateLimitHeaders({
      allowed: true,
      remaining: 10,
      retryAfterMs: 0,
      limit: 120,
    });

    expect(headers["X-RateLimit-Limit"]).toBe("120");
    expect(headers["X-RateLimit-Remaining"]).toBe("10");
    expect(headers["Retry-After"]).toBeUndefined();
  });

  it("should include Retry-After when blocked", async () => {
    const { rateLimitHeaders } = await import("./rate-limit");
    const headers = rateLimitHeaders({
      allowed: false,
      remaining: 0,
      retryAfterMs: 30000,
      limit: 5,
    });

    expect(headers["Retry-After"]).toBe("30");
  });
});
