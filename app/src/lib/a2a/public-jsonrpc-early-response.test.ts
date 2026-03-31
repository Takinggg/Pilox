import { describe, it, expect } from "vitest";
import {
  PUBLIC_A2A_JSONRPC_RATE_LIMIT_CODE,
  publicJsonRpcRateLimitedResponse,
} from "./public-jsonrpc-early-response";

describe("publicJsonRpcRateLimitedResponse", () => {
  it("returns JSON-RPC 429 with rate-limit headers", async () => {
    const res = publicJsonRpcRateLimitedResponse({
      allowed: false,
      remaining: 0,
      retryAfterMs: 12_000,
      limit: 30,
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("30");
    expect(res.headers.get("Retry-After")).toBe("12");
    const body = (await res.json()) as {
      jsonrpc: string;
      id: null;
      error: { code: number; message: string; data: Record<string, unknown> };
    };
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBeNull();
    expect(body.error.code).toBe(PUBLIC_A2A_JSONRPC_RATE_LIMIT_CODE);
    expect(body.error.message).toBe("Too many requests.");
    expect(body.error.data).toMatchObject({
      retryAfterSeconds: 12,
      limit: 30,
    });
  });
});
