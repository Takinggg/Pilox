import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuthorize = vi.fn();
const mockEnv = vi.fn();

vi.mock("@/lib/authorize", () => ({
  authorize: (r: "viewer" | "operator" | "admin") => mockAuthorize(r),
}));

vi.mock("@/lib/env", () => ({
  env: () => mockEnv(),
}));

import { GET } from "./route";

const dirReq = () =>
  new Request("http://localhost/api/mesh/federation/directory");

describe("GET /api/mesh/federation/directory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401 when unauthorized", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: false as const,
      response: new Response(null, { status: 401 }),
    });
    const res = await GET(dirReq());
    expect(res.status).toBe(401);
  });

  it("returns indexed peers when federation enabled", async () => {
    mockAuthorize.mockResolvedValue({ authorized: true as const });
    mockEnv.mockReturnValue({
      MESH_FEDERATION_ENABLED: true,
      MESH_FEDERATION_PEERS: "https://b.example,https://a.example",
      MESH_FEDERATION_MAX_PEERS: 512,
      MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS: "",
      MESH_FEDERATION_JWT_ALG: "HS256",
      MESH_FEDERATION_PEERS_MANIFEST_URL: undefined,
      MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX: "",
      MESH_FEDERATION_PEERS_MANIFEST_REFRESH_SECONDS: 300,
      MESH_FEDERATION_PEERS_MANIFEST_FETCH_TIMEOUT_MS: 15_000,
    });
    const res = await GET(dirReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      federationEnabled: boolean;
      peerCount: number;
      peers: Array<{ peerIndex: number; origin: string; agentCardUrl: string }>;
    };
    expect(body.federationEnabled).toBe(true);
    expect(body.peerCount).toBe(2);
    expect(body.peers[0].peerIndex).toBe(0);
    expect(body.peers[0].origin).toBe("https://b.example");
    expect(body.peers[0].agentCardUrl).toBe(
      "https://b.example/.well-known/agent-card.json"
    );
    expect(body.peers[1].peerIndex).toBe(1);
  });

  it("empty peers when federation disabled", async () => {
    mockAuthorize.mockResolvedValue({ authorized: true as const });
    mockEnv.mockReturnValue({
      MESH_FEDERATION_ENABLED: false,
      MESH_FEDERATION_PEERS: "https://x.example",
      MESH_FEDERATION_MAX_PEERS: 512,
      MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS: "",
      MESH_FEDERATION_JWT_ALG: "HS256",
      MESH_FEDERATION_PEERS_MANIFEST_URL: undefined,
      MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX: "",
      MESH_FEDERATION_PEERS_MANIFEST_REFRESH_SECONDS: 300,
      MESH_FEDERATION_PEERS_MANIFEST_FETCH_TIMEOUT_MS: 15_000,
    });
    const res = await GET(dirReq());
    const body = (await res.json()) as { peerCount: number; peers: unknown[] };
    expect(body.peerCount).toBe(0);
    expect(body.peers).toEqual([]);
  });
});
