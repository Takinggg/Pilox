import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCheck = vi.fn();

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitWithConfig: (...args: unknown[]) => mockCheck(...args),
  rateLimitResponse: () =>
    new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    }),
}));

import {
  enforceMeshFederationInboundRateLimit,
  enforceMeshFederationProxyRateLimit,
  meshFederationRateLimitRedisConfig,
} from "./mesh-federation-rate-limit";

describe("mesh-federation-rate-limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const e = {
    MESH_FEDERATION_RATE_LIMIT_MAX: 10,
    MESH_FEDERATION_RATE_LIMIT_WINDOW_MS: 5000,
  };

  it("meshFederationRateLimitRedisConfig uses federation key prefix", () => {
    const c = meshFederationRateLimitRedisConfig(e);
    expect(c.keyPrefix).toBe("pilox:rl:federation");
    expect(c.maxRequests).toBe(10);
    expect(c.windowMs).toBe(5000);
  });

  it("enforceMeshFederationInboundRateLimit returns 429 when over limit", async () => {
    mockCheck.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterMs: 1000,
      limit: 10,
    });
    const res = await enforceMeshFederationInboundRateLimit("10.0.0.1", e);
    expect(res?.status).toBe(429);
    expect(mockCheck).toHaveBeenCalledWith(
      "in:10.0.0.1",
      expect.objectContaining({ keyPrefix: "pilox:rl:federation" })
    );
  });

  it("enforceMeshFederationProxyRateLimit passes proxy-scoped key", async () => {
    mockCheck.mockResolvedValue({
      allowed: true,
      remaining: 9,
      retryAfterMs: 0,
      limit: 10,
    });
    const res = await enforceMeshFederationProxyRateLimit(
      "00000000-0000-4000-8000-000000000099",
      e
    );
    expect(res).toBeUndefined();
    expect(mockCheck).toHaveBeenCalledWith(
      "proxy:00000000-0000-4000-8000-000000000099",
      expect.any(Object)
    );
  });
});
