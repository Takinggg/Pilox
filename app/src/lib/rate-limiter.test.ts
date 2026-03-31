// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPipeline = {
  zremrangebyscore: vi.fn().mockReturnThis(),
  zadd: vi.fn().mockReturnThis(),
  zcard: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  incrby: vi.fn().mockReturnThis(),
  exec: vi.fn(() => Promise.resolve([
    [null, 0],   // zremrangebyscore
    [null, 1],   // zadd
    [null, 5],   // zcard — 5 requests in window
    [null, 1],   // expire
  ])),
};

const mockRedis = {
  pipeline: vi.fn(() => mockPipeline),
  get: vi.fn((): Promise<string | null> => Promise.resolve(null)),
  pttl: vi.fn(() => Promise.resolve(30000)),
};

vi.mock("./redis", () => ({
  getRedis: () => mockRedis,
}));

vi.mock("./logger", () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  checkRequestRateLimit,
  checkTokenRateLimit,
  recordTokenUsageForRateLimit,
} from "./rate-limiter";

describe("checkRequestRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows when no limit set", async () => {
    const result = await checkRequestRateLimit("a1", undefined);
    expect(result.allowed).toBe(true);
  });

  it("allows when under limit", async () => {
    // 5 requests in window, limit is 10
    const result = await checkRequestRateLimit("a1", 10);
    expect(result.allowed).toBe(true);
  });

  it("blocks when over limit", async () => {
    // 5 requests in window, limit is 3
    const result = await checkRequestRateLimit("a1", 3);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Rate limit exceeded");
    expect(result.retryAfterMs).toBe(60_000);
  });

  it("fail-open on Redis error", async () => {
    mockRedis.pipeline.mockImplementationOnce(() => {
      throw new Error("Redis down");
    });

    const result = await checkRequestRateLimit("a1", 10);
    expect(result.allowed).toBe(true);
  });
});

describe("checkTokenRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows when no limit set", async () => {
    const result = await checkTokenRateLimit("a1", undefined);
    expect(result.allowed).toBe(true);
  });

  it("allows when tokens under limit", async () => {
    mockRedis.get.mockResolvedValueOnce("500");
    const result = await checkTokenRateLimit("a1", 1000);
    expect(result.allowed).toBe(true);
  });

  it("blocks when tokens over limit", async () => {
    mockRedis.get.mockResolvedValueOnce("1500");
    const result = await checkTokenRateLimit("a1", 1000);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Token rate limit exceeded");
    expect(result.retryAfterMs).toBe(30000);
  });

  it("fail-open on Redis error", async () => {
    mockRedis.get.mockRejectedValueOnce(new Error("Redis down"));
    const result = await checkTokenRateLimit("a1", 1000);
    expect(result.allowed).toBe(true);
  });
});

describe("recordTokenUsageForRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records tokens via pipeline", async () => {
    await recordTokenUsageForRateLimit("a1", 150);
    expect(mockRedis.pipeline).toHaveBeenCalled();
    expect(mockPipeline.incrby).toHaveBeenCalledWith(
      "pilox:rl:tok:a1",
      150,
    );
    expect(mockPipeline.expire).toHaveBeenCalledWith("pilox:rl:tok:a1", 60);
  });

  it("skips when tokens <= 0", async () => {
    await recordTokenUsageForRateLimit("a1", 0);
    expect(mockRedis.pipeline).not.toHaveBeenCalled();
  });
});
