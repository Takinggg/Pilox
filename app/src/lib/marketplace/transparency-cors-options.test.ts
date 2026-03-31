// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockRefresh } = vi.hoisted(() => ({
  mockRefresh: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/runtime-instance-config", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/runtime-instance-config")>();
  return { ...mod, refreshRuntimeConfigCache: mockRefresh };
});

vi.mock("@/lib/env", () => ({
  env: () => ({
    AUTH_URL: "http://localhost:3000",
    PILOX_MARKETPLACE_CORS_ORIGINS: "",
  }),
}));

import { marketplaceTransparencyOptionsResponse } from "./transparency-cors";

describe("marketplaceTransparencyOptionsResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PILOX_MARKETPLACE_CORS_ORIGINS;
  });

  afterEach(() => {
    delete process.env.PILOX_MARKETPLACE_CORS_ORIGINS;
  });

  it("sets Access-Control-Allow-Origin for allowed extra origin from env", async () => {
    process.env.PILOX_MARKETPLACE_CORS_ORIGINS = "https://app.web.app";
    const req = new Request("http://localhost/api/marketplace/x/verify", {
      method: "OPTIONS",
      headers: { Origin: "https://app.web.app" },
    });
    const res = await marketplaceTransparencyOptionsResponse(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.web.app");
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("omits ACAO for disallowed origin", async () => {
    process.env.PILOX_MARKETPLACE_CORS_ORIGINS = "https://trusted.example";
    const req = new Request("http://localhost/api/marketplace/x/verify", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example" },
    });
    const res = await marketplaceTransparencyOptionsResponse(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
