// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuthorize = vi.fn();
const mockLoadPool = vi.fn();

vi.mock("@/lib/authorize", () => ({
  authorize: (r: "viewer" | "operator" | "admin") => mockAuthorize(r),
}));

vi.mock("@/lib/marketplace/catalog-pool", () => ({
  loadMarketplaceCatalogPool: (...args: unknown[]) => mockLoadPool(...args),
}));

vi.mock("@/lib/marketplace/pricing-policy", () => ({
  getMarketplacePricingEnforcement: () => "none" as const,
}));

import { GET } from "./route";

describe("GET /api/marketplace/catalog-export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadPool.mockResolvedValue({
      registries: [{ id: "u", name: "R", url: "https://r.example", authToken: null }],
      poolAgents: [
        {
          handle: "urn:pilox:one",
          registryName: "R",
          registryUrl: "https://r.example",
          registryId: "u",
          agentCardUrl: "https://c.example/a",
        },
      ],
      sources: [],
      builtAt: "2026-01-01T00:00:00.000Z",
      catalogTags: [],
      catalogMode: "redis" as const,
      globalCatalogSlots: 0 as const,
    });
  });

  it("401 when not operator", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: false as const,
      response: new Response(null, { status: 401 }),
    });
    const res = await GET(new Request("http://localhost/api/marketplace/catalog-export"));
    expect(res.status).toBe(401);
  });

  it("200 with export schema and agents", async () => {
    mockAuthorize.mockResolvedValue({ authorized: true as const });
    const res = await GET(new Request("http://localhost/api/marketplace/catalog-export"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      schema: string;
      agents: unknown[];
      total: number;
      meta: { registries: number };
    };
    expect(body.schema).toBe("pilox-marketplace-catalog-export-v1");
    expect(body.total).toBe(1);
    expect(body.agents).toHaveLength(1);
    expect(body.meta.registries).toBe(1);
  });
});
