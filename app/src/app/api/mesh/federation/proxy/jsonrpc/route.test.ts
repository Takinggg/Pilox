import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuthorize = vi.fn();
const mockEnv = vi.fn();
const mockProxy = vi.fn();

vi.mock("@/lib/authorize", () => ({
  authorize: (r: "viewer" | "operator" | "admin") => mockAuthorize(r),
}));

vi.mock("@/lib/env", () => ({
  env: () => mockEnv(),
}));

vi.mock("@/lib/mesh-federation-proxy-outbound", () => ({
  proxyA2AJsonRpcToPeerOrigin: (...a: unknown[]) => mockProxy(...a),
}));

vi.mock("@/lib/mesh-federation-rate-limit", () => ({
  enforceMeshFederationProxyRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ catch: vi.fn() })),
    })),
  },
}));

import { POST } from "./route";

describe("POST /api/mesh/federation/proxy/jsonrpc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseEnv = {
    AUTH_URL: "https://proxy-operator.pilox",
    A2A_ENABLED: true,
    A2A_JSONRPC_MAX_BODY_BYTES: 1_048_576,
    MESH_FEDERATION_ENABLED: true,
    MESH_FEDERATION_MAX_PEERS: 512,
    MESH_FEDERATION_PEERS_MANIFEST_URL: undefined as string | undefined,
    MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX: "",
    MESH_FEDERATION_PEERS_MANIFEST_REFRESH_SECONDS: 300,
    MESH_FEDERATION_PEERS_MANIFEST_FETCH_TIMEOUT_MS: 15_000,
    MESH_FEDERATION_PEERS: "https://a.example,https://b.example",
    MESH_FEDERATION_SHARED_SECRET: "x".repeat(32),
    MESH_FEDERATION_RATE_LIMIT_MAX: 100,
    MESH_FEDERATION_RATE_LIMIT_WINDOW_MS: 60_000,
    MESH_FEDERATION_INBOUND_ALLOWLIST: "",
    MESH_FEDERATION_JWT_TTL_SECONDS: 300,
    MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS: 60,
    MESH_FEDERATION_JWT_AUDIENCE: "",
    MESH_FEDERATION_JWT_REQUIRE_JTI: true,
    MESH_FEDERATION_JWT_REQUIRE_AUDIENCE: true,
    MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET: true,
    MESH_FEDERATION_PROXY_SEND_SECRET: false,
    MESH_FEDERATION_JWT_ALG: "HS256",
    MESH_FEDERATION_ED25519_SEED_HEX: "",
    MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS: "",
    MESH_FEDERATION_PROXY_OPERATOR_TOKEN: undefined,
  };

  it("returns 503 when federation secret missing", async () => {
    mockAuthorize.mockResolvedValue({ authorized: true as const });
    mockEnv.mockReturnValue({
      ...baseEnv,
      MESH_FEDERATION_SHARED_SECRET: undefined,
    });
    const res = await POST(
      new Request("http://h.test/api/mesh/federation/proxy/jsonrpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerIndex: 0, rpc: { jsonrpc: "2.0", id: 1, method: "x" } }),
      })
    );
    expect(res.status).toBe(503);
    expect(mockProxy).not.toHaveBeenCalled();
  });

  it("proxies to peer origin and returns upstream body", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: true as const,
      user: { id: "00000000-0000-4000-8000-000000000001", name: "Op", email: null },
      role: "operator",
      ip: "127.0.0.1",
      authSource: "session" as const,
      session: {},
    });
    mockEnv.mockReturnValue(baseEnv);
    mockProxy.mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "pong" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await POST(
      new Request("http://h.test/api/mesh/federation/proxy/jsonrpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peerIndex: 1,
          rpc: { jsonrpc: "2.0", id: 1, method: "tasks/list", params: {} },
        }),
      })
    );

    expect(res.status).toBe(200);
    const j = (await res.json()) as { result: string };
    expect(j.result).toBe("pong");
    expect(mockProxy).toHaveBeenCalledTimes(1);
    expect(mockProxy.mock.calls[0][0]).toBe("https://b.example");
    expect(typeof mockProxy.mock.calls[0][1]).toBe("string");
    expect(mockProxy.mock.calls[0][2]).toMatchObject({
      jwtAlg: "HS256",
      sharedSecret: "x".repeat(32),
      ed25519SeedHex: "",
      issuerOrigin: "https://proxy-operator.pilox",
      jwtTtlSeconds: 300,
      sendSharedSecret: false,
    });
  });

  it("returns 403 when proxy operator token is set but header missing", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: true as const,
      user: { id: "00000000-0000-4000-8000-000000000001", name: "Op", email: null },
      role: "operator",
      ip: "127.0.0.1",
      authSource: "session" as const,
      session: {},
    });
    mockEnv.mockReturnValue({
      ...baseEnv,
      MESH_FEDERATION_PROXY_OPERATOR_TOKEN: "p".repeat(32),
    });
    const res = await POST(
      new Request("http://h.test/api/mesh/federation/proxy/jsonrpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerIndex: 0, rpc: { jsonrpc: "2.0", id: 1, method: "x" } }),
      })
    );
    expect(res.status).toBe(403);
    expect(mockProxy).not.toHaveBeenCalled();
  });
});
