// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuthorize = vi.fn();
const mockCheckRateLimit = vi.fn();

const { mockResolve } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
}));

vi.mock("@/lib/authorize", () => ({
  authorize: (r: "viewer" | "operator" | "admin") => mockAuthorize(r),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  rateLimitHeaders: vi.fn(() => ({ "X-RateLimit-Limit": "30" })),
  rateLimitResponse: vi.fn(
    () => new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 }),
  ),
}));

vi.mock("@/lib/marketplace", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/marketplace")>();
  return { ...mod, resolveHandleAcrossRegistries: mockResolve };
});

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              id: "11111111-1111-1111-1111-111111111111",
              name: "R",
              url: "https://r.example",
              authToken: null,
            },
          ]),
      }),
    }),
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "x-client-ip": "203.0.113.1" })),
}));

import { GET } from "./route";

describe("GET /api/marketplace/[handle]/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PILOX_MARKETPLACE_VERIFY_PUBLIC;
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 10,
      retryAfterMs: 0,
      limit: 30,
    });
    mockResolve.mockResolvedValue({
      record: {
        schema: "pilox-registry-record-v1",
        handle: "urn:pilox:test/h",
        updatedAt: "2026-01-01T00:00:00Z",
        agentCardUrl: "https://c.example/card",
      },
      agentCard: null,
      registryName: "R",
      registryUrl: "https://r.example",
      registryId: "11111111-1111-1111-1111-111111111111",
    });
  });

  it("401 when not public and unauthorized", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: false as const,
      response: new Response(null, { status: 401 }),
    });
    const req = new Request("http://localhost/api/marketplace/urn%3Apilox%3Atest%2Fh/verify");
    const res = await GET(req, { params: Promise.resolve({ handle: "urn:pilox:test/h" }) });
    expect(res.status).toBe(401);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it("200 when viewer authorized", async () => {
    mockAuthorize.mockResolvedValue({ authorized: true as const });
    const req = new Request("http://localhost/api/marketplace/urn%3Apilox%3Atest%2Fh/verify");
    const res = await GET(req, { params: Promise.resolve({ handle: "urn:pilox:test/h" }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      schemaOk: boolean;
      proofSummary: string;
      publicAccess: boolean;
    };
    expect(body.schemaOk).toBe(true);
    expect(body.proofSummary).toBe("none");
    expect(body.publicAccess).toBe(false);
  });

  it("200 public mode without auth", async () => {
    process.env.PILOX_MARKETPLACE_VERIFY_PUBLIC = "true";
    mockAuthorize.mockResolvedValue({
      authorized: false as const,
      response: new Response(null, { status: 401 }),
    });
    const req = new Request("http://localhost/api/marketplace/x/verify");
    const res = await GET(req, { params: Promise.resolve({ handle: "x" }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { publicAccess: boolean };
    expect(body.publicAccess).toBe(true);
    expect(mockCheckRateLimit).toHaveBeenCalled();
  });

  it("429 when public mode and rate limited", async () => {
    process.env.PILOX_MARKETPLACE_VERIFY_PUBLIC = "true";
    mockAuthorize.mockResolvedValue({
      authorized: false as const,
      response: new Response(null, { status: 401 }),
    });
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterMs: 30_000,
      limit: 30,
    });
    const req = new Request("http://localhost/api/marketplace/x/verify");
    const res = await GET(req, { params: Promise.resolve({ handle: "x" }) });
    expect(res.status).toBe(429);
  });
});
