import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing
vi.mock("@/db", () => ({
  db: { select: vi.fn(), insert: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    status: "ready",
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  }),
}));

import { authorize } from "./authorize";
import { auth } from "@/lib/auth";

const mockAuth = vi.mocked(auth);

describe("authorize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no session and no token", async () => {
    mockAuth.mockResolvedValue(null as never);

    const result = await authorize("viewer");
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(401);
    }
  });

  it("allows a valid admin session", async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: "user-1",
        email: "admin@test.com",
        name: "Admin",
        role: "admin",
      },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as never);

    const result = await authorize("viewer");
    expect(result.authorized).toBe(true);
    if (result.authorized) {
      expect(result.user.id).toBe("user-1");
      expect((result.user as { role: string }).role).toBe("admin");
    }
  });

  it("rejects viewer when admin required", async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: "user-2",
        email: "viewer@test.com",
        name: "Viewer",
        role: "viewer",
      },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as never);

    const result = await authorize("admin");
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(403);
    }
  });

  it("blocks pre-MFA sessions from API access", async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: "user-3",
        email: "mfa@test.com",
        name: "MFA User",
        role: "admin",
        mfaRequired: true,
        mfaVerified: false,
      },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as never);

    const result = await authorize("viewer");
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(403);
      const body = await result.response.json();
      expect(body.error).toContain("MFA");
    }
  });

  it("allows MFA-verified sessions", async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: "user-4",
        email: "mfa@test.com",
        name: "MFA User",
        role: "admin",
        mfaRequired: true,
        mfaVerified: true,
      },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as never);

    const result = await authorize("viewer");
    expect(result.authorized).toBe(true);
  });

  it("respects role hierarchy: operator > viewer", async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: "user-5",
        email: "op@test.com",
        name: "Operator",
        role: "operator",
      },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as never);

    const viewerResult = await authorize("viewer");
    expect(viewerResult.authorized).toBe(true);

    const adminResult = await authorize("admin");
    expect(adminResult.authorized).toBe(false);
  });
});
