import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { mintMeshFederationJwt } from "@/lib/mesh-federation-jwt";
import { clearFederationPeersResolveMemoryCache } from "@/lib/mesh-federation-resolve";

const { mockEnv, mockAuthorize, mockHandle } = vi.hoisted(() => {
  return {
    mockEnv: vi.fn(),
    mockAuthorize: vi.fn(),
    mockHandle: vi.fn(),
  };
});

vi.mock("@/lib/env", () => ({
  env: () => mockEnv(),
}));

vi.mock("@/lib/authorize", () => ({
  authorize: (r: "viewer" | "operator" | "admin") => mockAuthorize(r),
}));

vi.mock("@/db", () => ({
  db: {} as never,
}));

vi.mock("@/lib/a2a/server", () => ({
  getPiloxA2AServer: () => ({ handler: {} as never }),
}));

vi.mock("@/lib/a2a/jsonrpc-next", () => ({
  handleA2AJsonRpcPost: (...a: unknown[]) => mockHandle(...a),
}));

vi.mock("@/lib/mesh-federation-rate-limit", () => ({
  enforceMeshFederationInboundRateLimit: vi.fn().mockResolvedValue(undefined),
}));

const mockPublicRl = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/a2a/public-jsonrpc-rate-limit", () => ({
  enforcePublicA2aJsonRpcRateLimit: (...a: unknown[]) => mockPublicRl(...a),
  normalizeA2aRateLimitClientIp: (raw: string) => {
    const t = raw.trim();
    if (!t) return "unknown";
    return t.slice(0, 200);
  },
  extractPublicIdentityFromRequest: () => null,
}));

vi.mock("@/lib/a2a/public-identity-reputation", () => ({
  recordPublicPeerReputationEvent: vi.fn().mockResolvedValue(undefined),
}));

const mockRepBlock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/a2a/public-reputation-block", () => ({
  enforcePublicReputationBlockIfNeeded: (...a: unknown[]) => mockRepBlock(...a),
}));

vi.mock("@/lib/mesh-federation-jwt-replay", () => ({
  consumeFederationJwtJtiOnce: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/mesh-federation-inbound-audit", () => ({
  auditMeshFederationInboundJsonRpcComplete: vi.fn(),
}));

import { POST } from "./route";
import { POST as POST_PUBLIC } from "./public/route";
import { POST as POST_FEDERATED } from "../federated/jsonrpc/route";

const secret = "s".repeat(32);

const fedAudience = "https://h.test";

const fedEnv = {
  A2A_ENABLED: true,
  A2A_JSONRPC_MAX_BODY_BYTES: 1_048_576,
  A2A_JSONRPC_MIN_ROLE: "viewer" as const,
  AUTH_URL: `${fedAudience}/`,
  MESH_FEDERATION_JWT_AUDIENCE: "",
  MESH_FEDERATION_ENABLED: true,
  MESH_FEDERATION_SHARED_SECRET: secret,
  MESH_FEDERATION_INBOUND_ALLOWLIST: "",
  MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS: 60,
  MESH_FEDERATION_JWT_REQUIRE_JTI: true,
  MESH_FEDERATION_JWT_REQUIRE_AUDIENCE: true,
  MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET: true,
  MESH_FEDERATION_JWT_ALG: "HS256",
  MESH_FEDERATION_PEERS: "",
  MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS: "",
  MESH_FEDERATION_RATE_LIMIT_MAX: 100,
  MESH_FEDERATION_RATE_LIMIT_WINDOW_MS: 60_000,
  MESH_FEDERATION_MAX_PEERS: 512,
  MESH_FEDERATION_PEERS_MANIFEST_URL: undefined as string | undefined,
  MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX: "",
  MESH_FEDERATION_PEERS_MANIFEST_REFRESH_SECONDS: 300,
  MESH_FEDERATION_PEERS_MANIFEST_FETCH_TIMEOUT_MS: 15_000,
  A2A_PUBLIC_JSONRPC_ENABLED: false,
  A2A_PUBLIC_JSONRPC_ALLOWED_METHODS: "",
  A2A_PUBLIC_JSONRPC_RATE_LIMIT_MAX: 30,
  A2A_PUBLIC_JSONRPC_RATE_LIMIT_WINDOW_MS: 60_000,
  A2A_PUBLIC_JSONRPC_IDENTITY_HEADER: "",
  A2A_PUBLIC_JSONRPC_IDENTITY_MAX_LEN: 256,
  A2A_PUBLIC_JSONRPC_IDENTITY_RATE_LIMIT_MAX: 30,
  A2A_PUBLIC_JSONRPC_IDENTITY_RATE_LIMIT_WINDOW_MS: 60_000,
  A2A_PUBLIC_JSONRPC_REPUTATION_ENABLED: false,
  A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_ENABLED: false,
  A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_BAD_EVENT_THRESHOLD: 100,
  A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_RETRY_AFTER_SECONDS: 3600,
  A2A_PUBLIC_JSONRPC_API_KEYS: "",
  A2A_PUBLIC_JSONRPC_API_KEY_RATE_LIMIT_MAX: 120,
  A2A_PUBLIC_JSONRPC_API_KEY_RATE_LIMIT_WINDOW_MS: 60_000,
  A2A_PUBLIC_JSONRPC_REQUIRE_API_KEY: false,
  MESH_PUBLIC_MESH_BOOTSTRAP_URLS: "",
  MESH_PUBLIC_DHT_BOOTSTRAP_URLS: "",
  MESH_GATEWAY_INBOUND_SECRET: "",
  MESH_GATEWAY_JSONRPC_ENFORCE: false,
};

describe("POST /api/a2a/jsonrpc", () => {
  beforeEach(() => {
    clearFederationPeersResolveMemoryCache();
    vi.clearAllMocks();
    mockEnv.mockReturnValue(fedEnv);
    mockHandle.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    mockRepBlock.mockResolvedValue(undefined);
  });

  it("returns 503 when A2A is disabled", async () => {
    mockEnv.mockReturnValue({ ...fedEnv, A2A_ENABLED: false });
    const res = await POST(
      new Request("http://h.test/api/a2a/jsonrpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    );
    expect(res.status).toBe(503);
    expect(mockHandle).not.toHaveBeenCalled();
  });

  it("returns 400 when both federation JWT and secret headers are sent", async () => {
    const jwt = mintMeshFederationJwt(secret, 60, fedAudience);
    const res = await POST(
      new Request("http://h.test/api/a2a/jsonrpc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pilox-federation-jwt": jwt,
          "x-pilox-federation-secret": secret,
        },
        body: "{}",
      })
    );
    expect(res.status).toBe(400);
    expect(mockAuthorize).not.toHaveBeenCalled();
    expect(mockHandle).not.toHaveBeenCalled();
  });

  it("uses federation auth and skips session authorize when JWT is valid", async () => {
    const jwt = mintMeshFederationJwt(secret, 60, fedAudience);
    const res = await POST(
      new Request("http://h.test/api/a2a/jsonrpc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pilox-federation-jwt": jwt,
        },
        body: '{"jsonrpc":"2.0","id":1,"method":"tasks/list","params":{}}',
      })
    );
    expect(res.status).toBe(200);
    expect(mockAuthorize).not.toHaveBeenCalled();
    expect(mockHandle).toHaveBeenCalledTimes(1);
    const userArg = mockHandle.mock.calls[0][2] as { userName: string };
    expect(userArg.userName).toBe("pilox-federated");
  });

  it("returns 401 when JWT aud does not match this instance", async () => {
    const jwt = mintMeshFederationJwt(secret, 60, "https://other-peer.example");
    const res = await POST(
      new Request("http://h.test/api/a2a/jsonrpc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pilox-federation-jwt": jwt,
        },
        body: "{}",
      })
    );
    expect(res.status).toBe(401);
    expect(mockHandle).not.toHaveBeenCalled();
  });

  it("uses federation auth with legacy X-Pilox-Federation-Secret when valid", async () => {
    const res = await POST(
      new Request("http://h.test/api/a2a/jsonrpc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pilox-federation-secret": secret,
        },
        body: '{"jsonrpc":"2.0","id":1,"method":"tasks/list","params":{}}',
      })
    );
    expect(res.status).toBe(200);
    expect(mockAuthorize).not.toHaveBeenCalled();
    expect(mockHandle).toHaveBeenCalledTimes(1);
    const userArg = mockHandle.mock.calls[0][2] as { userName: string };
    expect(userArg.userName).toBe("pilox-federated");
  });

  it("returns 403 when legacy secret inbound is disabled", async () => {
    mockEnv.mockReturnValue({
      ...fedEnv,
      MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET: false,
    });
    const res = await POST(
      new Request("http://h.test/api/a2a/jsonrpc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pilox-federation-secret": secret,
        },
        body: "{}",
      })
    );
    expect(res.status).toBe(403);
    expect(mockHandle).not.toHaveBeenCalled();
  });

  it("calls authorize when no federation credentials are present", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: true as const,
      user: { id: "u1", name: "U", email: null },
      role: "viewer" as const,
      ip: "127.0.0.1",
      authSource: "session" as const,
      session: {},
    });
    await POST(
      new Request("http://h.test/api/a2a/jsonrpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}',
      })
    );
    expect(mockAuthorize).toHaveBeenCalledWith("viewer");
    expect(mockHandle).toHaveBeenCalledTimes(1);
  });

  it("uses public tier when enabled and method is allowlisted (no session)", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    mockEnv.mockReturnValue({
      ...fedEnv,
      A2A_PUBLIC_JSONRPC_ENABLED: true,
      A2A_PUBLIC_JSONRPC_ALLOWED_METHODS: "tasks/list",
    });
    const res = await POST(
      new Request("http://h.test/api/a2a/jsonrpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"jsonrpc":"2.0","id":1,"method":"tasks/list","params":{}}',
      })
    );
    expect(res.status).toBe(200);
    expect(mockHandle).toHaveBeenCalledTimes(1);
    const userArg = mockHandle.mock.calls[0][2] as { userName: string };
    expect(userArg.userName).toBe("pilox-public-a2a");
  });

  it("returns 403 when MESH_GATEWAY_JSONRPC_ENFORCE and header missing", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const gw = "w".repeat(16);
    mockEnv.mockReturnValue({
      ...fedEnv,
      A2A_PUBLIC_JSONRPC_ENABLED: true,
      A2A_PUBLIC_JSONRPC_ALLOWED_METHODS: "tasks/list",
      MESH_GATEWAY_INBOUND_SECRET: gw,
      MESH_GATEWAY_JSONRPC_ENFORCE: true,
    });
    const res = await POST(
      new Request("http://h.test/api/a2a/jsonrpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"jsonrpc":"2.0","id":1,"method":"tasks/list","params":{}}',
      })
    );
    expect(res.status).toBe(403);
    expect(mockHandle).not.toHaveBeenCalled();
  });

  it("allows JSON-RPC when gateway enforce and X-Pilox-Gateway-Auth matches", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const gw = "w".repeat(16);
    mockEnv.mockReturnValue({
      ...fedEnv,
      A2A_PUBLIC_JSONRPC_ENABLED: true,
      A2A_PUBLIC_JSONRPC_ALLOWED_METHODS: "tasks/list",
      MESH_GATEWAY_INBOUND_SECRET: gw,
      MESH_GATEWAY_JSONRPC_ENFORCE: true,
    });
    const res = await POST(
      new Request("http://h.test/api/a2a/jsonrpc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pilox-gateway-auth": `Bearer ${gw}`,
        },
        body: '{"jsonrpc":"2.0","id":1,"method":"tasks/list","params":{}}',
      })
    );
    expect(res.status).toBe(200);
    expect(mockHandle).toHaveBeenCalledTimes(1);
  });

  it("public tier: reputation block short-circuits with 429 before handler", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const k = "k".repeat(32);
    mockEnv.mockReturnValue({
      ...fedEnv,
      A2A_PUBLIC_JSONRPC_ENABLED: true,
      A2A_PUBLIC_JSONRPC_ALLOWED_METHODS: "tasks/list",
      A2A_PUBLIC_JSONRPC_API_KEYS: k,
    });
    const synthetic429 = new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32005, message: "Too many requests." },
      }),
      { status: 429 }
    );
    mockRepBlock.mockResolvedValueOnce(synthetic429);
    const res = await POST(
      new Request("http://h.test/api/a2a/jsonrpc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pilox-Public-A2A-Key": k,
        },
        body: '{"jsonrpc":"2.0","id":1,"method":"tasks/list","params":{}}',
      })
    );
    expect(res.status).toBe(429);
    expect(mockHandle).not.toHaveBeenCalled();
    expect(mockRepBlock).toHaveBeenCalled();
  });

  it("returns 401 when public tier is on but method is not allowlisted", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    mockEnv.mockReturnValue({
      ...fedEnv,
      A2A_PUBLIC_JSONRPC_ENABLED: true,
      A2A_PUBLIC_JSONRPC_ALLOWED_METHODS: "tasks/list",
    });
    const res = await POST(
      new Request("http://h.test/api/a2a/jsonrpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"jsonrpc":"2.0","id":1,"method":"message/send","params":{}}',
      })
    );
    expect(res.status).toBe(401);
    expect(mockHandle).not.toHaveBeenCalled();
    expect(mockPublicRl).not.toHaveBeenCalled();
  });

  it("public tier: invalid JSON returns 400 JSON-RPC without calling handler", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    mockEnv.mockReturnValue({
      ...fedEnv,
      A2A_PUBLIC_JSONRPC_ENABLED: true,
      A2A_PUBLIC_JSONRPC_ALLOWED_METHODS: "tasks/list",
    });
    const res = await POST(
      new Request("http://h.test/api/a2a/jsonrpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      })
    );
    expect(res.status).toBe(400);
    expect(mockHandle).not.toHaveBeenCalled();
    expect(mockPublicRl).toHaveBeenCalledTimes(1);
    const j = (await res.json()) as {
      jsonrpc: string;
      id: null;
      error: { code: number; message: string };
    };
    expect(j.jsonrpc).toBe("2.0");
    expect(j.id).toBeNull();
    expect(j.error.message).toContain("Invalid JSON");
  });

  it("public tier: oversize Content-Length returns 413 JSON-RPC without calling handler", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    mockEnv.mockReturnValue({
      ...fedEnv,
      A2A_PUBLIC_JSONRPC_ENABLED: true,
      A2A_PUBLIC_JSONRPC_ALLOWED_METHODS: "tasks/list",
      A2A_JSONRPC_MAX_BODY_BYTES: 100,
    });
    const res = await POST(
      new Request("http://h.test/api/a2a/jsonrpc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "999999",
        },
        body: "{}",
      })
    );
    expect(res.status).toBe(413);
    expect(mockHandle).not.toHaveBeenCalled();
    expect(mockPublicRl).toHaveBeenCalledTimes(1);
    const j = (await res.json()) as { error: { message: string } };
    expect(j.error.message).toMatch(/too large/i);
  });

  it("POST /api/a2a/federated/jsonrpc matches main route for federation JWT", async () => {
    const jwt = mintMeshFederationJwt(secret, 60, fedAudience);
    const res = await POST_FEDERATED(
      new Request("http://h.test/api/a2a/federated/jsonrpc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pilox-federation-jwt": jwt,
        },
        body: '{"jsonrpc":"2.0","id":1,"method":"tasks/list","params":{}}',
      })
    );
    expect(res.status).toBe(200);
    expect(mockAuthorize).not.toHaveBeenCalled();
    expect(mockHandle).toHaveBeenCalledTimes(1);
  });

  it("POST /api/a2a/jsonrpc/public matches main route for public-tier invalid JSON", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    mockEnv.mockReturnValue({
      ...fedEnv,
      A2A_PUBLIC_JSONRPC_ENABLED: true,
      A2A_PUBLIC_JSONRPC_ALLOWED_METHODS: "tasks/list",
    });
    const res = await POST_PUBLIC(
      new Request("http://h.test/api/a2a/jsonrpc/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "!!!",
      })
    );
    expect(res.status).toBe(400);
    expect(mockHandle).not.toHaveBeenCalled();
    expect(mockPublicRl).toHaveBeenCalledTimes(1);
  });

  it("public tier: valid JSON but missing method returns 400 without calling handler", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    mockEnv.mockReturnValue({
      ...fedEnv,
      A2A_PUBLIC_JSONRPC_ENABLED: true,
      A2A_PUBLIC_JSONRPC_ALLOWED_METHODS: "tasks/list",
    });
    const res = await POST(
      new Request("http://h.test/api/a2a/jsonrpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"jsonrpc":"2.0","id":1}',
      })
    );
    expect(res.status).toBe(400);
    expect(mockHandle).not.toHaveBeenCalled();
    expect(mockPublicRl).toHaveBeenCalledTimes(1);
    const j = (await res.json()) as { error: { code: number } };
    expect(j.error.code).toBe(-32600);
  });

  it("public tier: REQUIRE_API_KEY returns 401 without key", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const k = "r".repeat(32);
    mockEnv.mockReturnValue({
      ...fedEnv,
      A2A_PUBLIC_JSONRPC_ENABLED: true,
      A2A_PUBLIC_JSONRPC_ALLOWED_METHODS: "tasks/list",
      A2A_PUBLIC_JSONRPC_API_KEYS: k,
      A2A_PUBLIC_JSONRPC_REQUIRE_API_KEY: true,
    });
    const res = await POST(
      new Request("http://h.test/api/a2a/jsonrpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"jsonrpc":"2.0","id":1,"method":"tasks/list","params":{}}',
      })
    );
    expect(res.status).toBe(401);
    expect(mockHandle).not.toHaveBeenCalled();
    expect(mockPublicRl).not.toHaveBeenCalled();
  });

  it("public tier: REQUIRE_API_KEY succeeds with X-Pilox-Public-A2A-Key", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const k = "s".repeat(32);
    mockEnv.mockReturnValue({
      ...fedEnv,
      A2A_PUBLIC_JSONRPC_ENABLED: true,
      A2A_PUBLIC_JSONRPC_ALLOWED_METHODS: "tasks/list",
      A2A_PUBLIC_JSONRPC_API_KEYS: k,
      A2A_PUBLIC_JSONRPC_REQUIRE_API_KEY: true,
    });
    const res = await POST(
      new Request("http://h.test/api/a2a/jsonrpc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pilox-Public-A2A-Key": k,
        },
        body: '{"jsonrpc":"2.0","id":1,"method":"tasks/list","params":{}}',
      })
    );
    expect(res.status).toBe(200);
    expect(mockHandle).toHaveBeenCalledTimes(1);
    expect(mockPublicRl).toHaveBeenCalled();
  });

  it("public tier: REQUIRE_API_KEY still returns 400 JSON-RPC for invalid JSON", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const k = "t".repeat(32);
    mockEnv.mockReturnValue({
      ...fedEnv,
      A2A_PUBLIC_JSONRPC_ENABLED: true,
      A2A_PUBLIC_JSONRPC_ALLOWED_METHODS: "tasks/list",
      A2A_PUBLIC_JSONRPC_API_KEYS: k,
      A2A_PUBLIC_JSONRPC_REQUIRE_API_KEY: true,
    });
    const res = await POST(
      new Request("http://h.test/api/a2a/jsonrpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      })
    );
    expect(res.status).toBe(400);
    expect(mockHandle).not.toHaveBeenCalled();
    expect(mockPublicRl).toHaveBeenCalledTimes(1);
  });

  it("public tier: scoped API key returns 401 for method outside scope", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const k = "u".repeat(32);
    mockEnv.mockReturnValue({
      ...fedEnv,
      A2A_PUBLIC_JSONRPC_ENABLED: true,
      A2A_PUBLIC_JSONRPC_ALLOWED_METHODS: "tasks/list,tasks/get",
      A2A_PUBLIC_JSONRPC_API_KEYS: `${k}|tasks/list`,
    });
    const res = await POST(
      new Request("http://h.test/api/a2a/jsonrpc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pilox-Public-A2A-Key": k,
        },
        body: '{"jsonrpc":"2.0","id":1,"method":"tasks/get","params":{}}',
      })
    );
    expect(res.status).toBe(401);
    expect(mockHandle).not.toHaveBeenCalled();
  });

  it("public tier: invalid API key returns 401 when keys configured", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    mockEnv.mockReturnValue({
      ...fedEnv,
      A2A_PUBLIC_JSONRPC_ENABLED: true,
      A2A_PUBLIC_JSONRPC_ALLOWED_METHODS: "tasks/list",
      A2A_PUBLIC_JSONRPC_API_KEYS: "a".repeat(32),
      A2A_PUBLIC_JSONRPC_REQUIRE_API_KEY: false,
    });
    const res = await POST(
      new Request("http://h.test/api/a2a/jsonrpc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pilox-Public-A2A-Key": "b".repeat(32),
        },
        body: '{"jsonrpc":"2.0","id":1,"method":"tasks/list","params":{}}',
      })
    );
    expect(res.status).toBe(401);
    expect(mockHandle).not.toHaveBeenCalled();
  });
});
