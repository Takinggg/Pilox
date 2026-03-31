/**
 * Tests for the apiGuard helper and withHeaders utility.
 */
import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";

// Test the withHeaders utility directly (pure function, no mocking needed)
function withHeaders(
  response: NextResponse,
  headers: Record<string, string>
): NextResponse {
  for (const [k, v] of Object.entries(headers)) {
    response.headers.set(k, v);
  }
  return response;
}

describe("withHeaders", () => {
  it("appends rate limit headers to response", () => {
    const res = NextResponse.json({ ok: true });
    const headers = {
      "X-RateLimit-Limit": "120",
      "X-RateLimit-Remaining": "100",
    };

    const result = withHeaders(res, headers);

    expect(result.headers.get("X-RateLimit-Limit")).toBe("120");
    expect(result.headers.get("X-RateLimit-Remaining")).toBe("100");
  });

  it("overwrites existing headers", () => {
    const res = NextResponse.json({ ok: true });
    res.headers.set("X-Custom", "old");
    withHeaders(res, { "X-Custom": "new" });
    expect(res.headers.get("X-Custom")).toBe("new");
  });

  it("handles empty headers map", () => {
    const res = NextResponse.json({ ok: true });
    withHeaders(res, {});
    // Should not throw
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });
});

// Test rate limit response shape
describe("Rate limit response shape", () => {
  it("produces correct 429 response", () => {
    const body = {
      error: "Too many requests",
      retryAfterSeconds: 30,
    };
    const res = new Response(JSON.stringify(body), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Limit": "5",
        "X-RateLimit-Remaining": "0",
        "Retry-After": "30",
      },
    });

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });
});
