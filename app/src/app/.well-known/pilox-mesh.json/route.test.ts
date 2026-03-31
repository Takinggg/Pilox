import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MESH_V2_CONTRACT_VERSION,
  PLANETARY_MESH_REFERENCE_VERSION,
} from "@/lib/mesh-version";

const mockEnv = vi.fn();
const mockBuildFed = vi.fn();

vi.mock("@/lib/env", () => ({
  env: () => mockEnv(),
}));

vi.mock("@/lib/mesh-federation", () => ({
  buildMeshFederationPublicAsync: (...a: unknown[]) => mockBuildFed(...a),
}));

import { GET } from "./route";

const fedOff = {
  enabled: false,
  phase: "2.0-config" as const,
  configuredPeerCount: 0,
  peerHostnames: [] as string[],
  sharedSecretConfigured: false,
  directoryPath: null,
  federationInboundAllowlistActive: false,
  federatedInboundJsonRpcPath: null,
  jsonRpcProxy: null,
};

function baseEnv(over: Record<string, unknown>) {
  return {
    AUTH_URL: "https://mesh.test",
    A2A_ENABLED: true,
    A2A_PUBLIC_JSONRPC_ENABLED: false,
    A2A_PUBLIC_JSONRPC_REPUTATION_ENABLED: false,
    A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_ENABLED: false,
    A2A_PUBLIC_JSONRPC_API_KEYS: "",
    MESH_PUBLIC_MESH_BOOTSTRAP_URLS: "",
    MESH_PUBLIC_DHT_BOOTSTRAP_URLS: "",
    ...over,
  };
}

describe("GET /.well-known/pilox-mesh.json", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildFed.mockResolvedValue(fedOff);
  });

  it("returns 503 when AUTH_URL is invalid", async () => {
    mockEnv.mockReturnValue(baseEnv({ AUTH_URL: "not-a-url" }));
    const res = await GET(new Request("https://mesh.test/.well-known/pilox-mesh.json"));
    expect(res.status).toBe(503);
    expect(mockBuildFed).not.toHaveBeenCalled();
  });

  it("includes meshV2 and null a2a when A2A disabled", async () => {
    mockEnv.mockReturnValue(baseEnv({ A2A_ENABLED: false }));
    const res = await GET(new Request("https://mesh.test/.well-known/pilox-mesh.json"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.schema).toBe("pilox-mesh-descriptor-v1");
    expect(body.meshV2).toBe(MESH_V2_CONTRACT_VERSION);
    expect(body.planetaryReferenceVersion).toBe(PLANETARY_MESH_REFERENCE_VERSION);
    expect(body.instanceOrigin).toBe("https://mesh.test");
    expect(body.a2aEnabled).toBe(false);
    expect(body.a2a).toBeNull();
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(mockBuildFed).toHaveBeenCalledTimes(1);
  });

  it("includes publicTier with scopesEnabled when public JSON-RPC and scoped keys", async () => {
    const k = "s".repeat(32);
    mockEnv.mockReturnValue(
      baseEnv({
        A2A_PUBLIC_JSONRPC_ENABLED: true,
        A2A_PUBLIC_JSONRPC_REPUTATION_ENABLED: true,
        A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_ENABLED: true,
        A2A_PUBLIC_JSONRPC_API_KEYS: `${k}|tasks/list`,
      })
    );
    const res = await GET(new Request("https://mesh.test/.well-known/pilox-mesh.json"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      a2a: {
        publicJsonRpcUrl: string;
        publicTier: {
          reputationCounters: boolean;
          reputationBlock: boolean;
          scopesEnabled: boolean;
        };
      };
    };
    expect(body.a2a.publicJsonRpcUrl).toContain("/api/a2a/jsonrpc/public");
    expect(body.a2a.publicTier.reputationCounters).toBe(true);
    expect(body.a2a.publicTier.reputationBlock).toBe(true);
    expect(body.a2a.publicTier.scopesEnabled).toBe(true);
  });

  it("includes publicMesh.dhtBootstrapHints when MESH_PUBLIC_DHT_BOOTSTRAP_URLS is set", async () => {
    mockEnv.mockReturnValue(
      baseEnv({
        A2A_ENABLED: false,
        MESH_PUBLIC_DHT_BOOTSTRAP_URLS: "/dnsaddr/pilox.example/tcp/443/wss,https://rendezvous.example/announce",
      })
    );
    const res = await GET(new Request("https://mesh.test/.well-known/pilox-mesh.json"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      publicMesh: { bootstrapMeshDescriptorUrls: string[]; dhtBootstrapHints: string[] };
    };
    expect(body.publicMesh.bootstrapMeshDescriptorUrls).toEqual([]);
    expect(body.publicMesh.dhtBootstrapHints).toEqual([
      "/dnsaddr/pilox.example/tcp/443/wss",
      "https://rendezvous.example/announce",
    ]);
  });

  it("sets scopesEnabled false for legacy comma-only API keys", async () => {
    const k = "l".repeat(32);
    mockEnv.mockReturnValue(
      baseEnv({
        A2A_PUBLIC_JSONRPC_ENABLED: true,
        A2A_PUBLIC_JSONRPC_API_KEYS: `${k},${"m".repeat(32)}`,
      })
    );
    const res = await GET(new Request("https://mesh.test/.well-known/pilox-mesh.json"));
    const body = (await res.json()) as {
      a2a: { publicTier: { scopesEnabled: boolean } };
    };
    expect(body.a2a.publicTier.scopesEnabled).toBe(false);
  });
});
