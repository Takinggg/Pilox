import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuthorize = vi.fn();
const mockEnv = vi.fn();
const mockProbe = vi.fn();

vi.mock("@/lib/authorize", () => ({
  authorize: (minimumRole: "viewer" | "operator" | "admin") =>
    mockAuthorize(minimumRole),
}));

vi.mock("@/lib/env", () => ({
  env: () => mockEnv(),
}));

vi.mock("@/lib/mesh-federation-probe", () => ({
  probeFederationAgentCards: (origins: string[]) => mockProbe(origins),
}));

import { MESH_V2_CONTRACT_VERSION } from "@/lib/mesh-version";
import { GET } from "./route";

const FED_WAN = {
  MESH_FEDERATION_MAX_PEERS: 512,
  MESH_FEDERATION_PEERS_MANIFEST_URL: undefined as string | undefined,
  MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX: "",
  MESH_FEDERATION_PEERS_MANIFEST_REFRESH_SECONDS: 300,
  MESH_FEDERATION_PEERS_MANIFEST_FETCH_TIMEOUT_MS: 15_000,
  MESH_FEDERATION_SHARED_SECRET: undefined as string | undefined,
};

describe("GET /api/mesh/federation/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authorized", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: false as const,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    });
    const res = await GET(
      new Request("http://h.test/api/mesh/federation/status")
    );
    expect(res.status).toBe(401);
    expect(mockEnv).not.toHaveBeenCalled();
  });

  it("uses viewer auth and omits probe by default", async () => {
    mockAuthorize.mockImplementation(async (minimumRole) => {
      expect(minimumRole).toBe("viewer");
      return { authorized: true as const };
    });
    mockEnv.mockReturnValue({
      AUTH_URL: "https://status.test",
      MESH_FEDERATION_ENABLED: true,
      MESH_FEDERATION_PEERS: "https://a.example",
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
      ...FED_WAN,
    });
    const res = await GET(
      new Request("http://h.test/api/mesh/federation/status")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.meshV2).toBe(MESH_V2_CONTRACT_VERSION);
    expect(body.federation).toBeDefined();
    expect("probe" in body).toBe(false);
    expect(mockProbe).not.toHaveBeenCalled();
  });

  it("debug_manifest=1 uses operator auth and includes manifestDebug", async () => {
    mockAuthorize.mockImplementation(async (minimumRole) => {
      expect(minimumRole).toBe("operator");
      return { authorized: true as const };
    });
    mockEnv.mockReturnValue({
      AUTH_URL: "https://status.test",
      MESH_FEDERATION_ENABLED: true,
      MESH_FEDERATION_PEERS: "https://a.example",
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
      ...FED_WAN,
    });
    const res = await GET(
      new Request(
        "http://h.test/api/mesh/federation/status?debug_manifest=1"
      )
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      manifestDebug: {
        manifestLastError: string | null;
        effectivePeerCount: number;
      };
    };
    expect(body.manifestDebug.manifestLastError).toBeNull();
    expect(body.manifestDebug.effectivePeerCount).toBe(1);
  });

  it("probe=1 uses operator auth and includes probe rows", async () => {
    mockAuthorize.mockImplementation(async (minimumRole) => {
      expect(minimumRole).toBe("operator");
      return { authorized: true as const };
    });
    mockEnv.mockReturnValue({
      AUTH_URL: "https://status.test",
      MESH_FEDERATION_ENABLED: true,
      MESH_FEDERATION_PEERS: "https://peer.pilox",
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
      ...FED_WAN,
    });
    mockProbe.mockResolvedValue([
      {
        origin: "https://peer.pilox",
        hostname: "peer.pilox",
        ok: true,
        statusCode: 200,
        latencyMs: 12,
      },
    ]);
    const res = await GET(
      new Request("http://h.test/api/mesh/federation/status?probe=1")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      probe: Array<{ ok: boolean; hostname: string }>;
    };
    expect(body.probe).toHaveLength(1);
    expect(body.probe[0].ok).toBe(true);
    expect(mockProbe).toHaveBeenCalledWith(["https://peer.pilox"]);
  });

  it("probe=1 with federation disabled returns empty probe without probing", async () => {
    mockAuthorize.mockResolvedValue({ authorized: true as const });
    mockEnv.mockReturnValue({
      AUTH_URL: "https://status.test",
      MESH_FEDERATION_ENABLED: false,
      MESH_FEDERATION_PEERS: "https://ignored.example",
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
      ...FED_WAN,
    });
    const res = await GET(
      new Request("http://h.test/api/mesh/federation/status?probe=1")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { probe: unknown[] };
    expect(body.probe).toEqual([]);
    expect(mockProbe).not.toHaveBeenCalled();
  });

  it("probe=1 returns 403 when authorize fails", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: false as const,
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    });
    const res = await GET(
      new Request("http://h.test/api/mesh/federation/status?probe=1")
    );
    expect(res.status).toBe(403);
    expect(mockProbe).not.toHaveBeenCalled();
  });
});
