import { describe, it, expect } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import {
  getFederationEd25519PublicKeyHexFromSeed,
  parseFederationPeerEd25519PublicKeysHex,
} from "./mesh-federation-ed25519";
import {
  DEFAULT_MAX_FEDERATION_PEER_ORIGINS,
  parseFederationPeerUrls,
  buildMeshFederationPublicAsync,
  buildFederationDirectoryPeers,
  type MeshFederationPublicEnv,
} from "./mesh-federation";
import type { ResolvedFederationPeers } from "./mesh-federation-resolve";

/** Avoid Redis / manifest fetch in unit tests — mirrors static-only `mergePeers` (HS256 path). */
function resolvedStaticHs256(
  e: Pick<MeshFederationPublicEnv, "MESH_FEDERATION_PEERS" | "MESH_FEDERATION_MAX_PEERS">
): ResolvedFederationPeers {
  const origins = parseFederationPeerUrls(
    e.MESH_FEDERATION_PEERS,
    e.MESH_FEDERATION_MAX_PEERS
  );
  return {
    origins,
    ed25519PublicKeysHex: [],
    staticPeerCount: origins.length,
    manifestPeerCount: 0,
    manifestError: null,
  };
}

/** Static peers + env Ed25519 keys (same order), lowercased like production merge. */
function resolvedStaticEd25519(
  e: Pick<
    MeshFederationPublicEnv,
    | "MESH_FEDERATION_PEERS"
    | "MESH_FEDERATION_MAX_PEERS"
    | "MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS"
  >
): ResolvedFederationPeers {
  const origins = parseFederationPeerUrls(
    e.MESH_FEDERATION_PEERS,
    e.MESH_FEDERATION_MAX_PEERS
  );
  const ed25519PublicKeysHex = parseFederationPeerEd25519PublicKeysHex(
    e.MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS
  ).map((k) => k.trim().toLowerCase());
  return {
    origins,
    ed25519PublicKeysHex,
    staticPeerCount: origins.length,
    manifestPeerCount: 0,
    manifestError: null,
  };
}

const FED_JWT_DEFAULTS: Partial<MeshFederationPublicEnv> = {
  MESH_FEDERATION_JWT_ALG: "HS256",
  MESH_FEDERATION_ED25519_SEED_HEX: "",
  MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS: "",
  MESH_FEDERATION_PROXY_OPERATOR_TOKEN: undefined,
  MESH_FEDERATION_MAX_PEERS: 512,
  MESH_FEDERATION_PEERS_MANIFEST_URL: undefined,
  MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX: "",
  MESH_FEDERATION_PEERS_MANIFEST_REFRESH_SECONDS: 300,
  MESH_FEDERATION_PEERS_MANIFEST_FETCH_TIMEOUT_MS: 15_000,
};

describe("mesh-federation", () => {
  it("buildFederationDirectoryPeers preserves order and agent card URL", () => {
    const peers = buildFederationDirectoryPeers([
      "https://one.example",
      "https://two.example",
    ]);
    expect(peers[1].peerIndex).toBe(1);
    expect(peers[1].agentCardUrl).toBe(
      "https://two.example/.well-known/agent-card.json"
    );
  });

  it("parseFederationPeerUrls normalizes origins and dedupes", () => {
    expect(
      parseFederationPeerUrls(
        "https://a.example/path?q=1, https://b.example,https://a.example/foo",
        DEFAULT_MAX_FEDERATION_PEER_ORIGINS
      )
    ).toEqual(["https://a.example", "https://b.example"]);
  });

  it("parseFederationPeerUrls respects max cap", () => {
    const cap = 64;
    const parts = Array.from({ length: cap + 10 }, (_, i) => `https://p${i}.example`);
    const r = parseFederationPeerUrls(parts.join(","), cap);
    expect(r.length).toBe(cap);
    expect(r[0]).toBe("https://p0.example");
    expect(r[cap - 1]).toBe(`https://p${cap - 1}.example`);
  });

  it("buildMeshFederationPublicAsync exposes hostnames only", async () => {
    const env = {
      ...FED_JWT_DEFAULTS,
      MESH_FEDERATION_ENABLED: true,
      MESH_FEDERATION_PEERS: "https://pilox.other:8443/agent",
      MESH_FEDERATION_SHARED_SECRET: undefined,
      MESH_FEDERATION_RATE_LIMIT_MAX: 100,
      MESH_FEDERATION_RATE_LIMIT_WINDOW_MS: 60_000,
      MESH_FEDERATION_INBOUND_ALLOWLIST: "",
      MESH_FEDERATION_JWT_TTL_SECONDS: 300,
      MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS: 60,
      MESH_FEDERATION_JWT_REQUIRE_JTI: true,
      MESH_FEDERATION_JWT_REQUIRE_AUDIENCE: true,
      MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET: true,
      MESH_FEDERATION_PROXY_SEND_SECRET: false,
      AUTH_URL: "https://app.pilox.test",
      MESH_FEDERATION_JWT_AUDIENCE: "",
    } as MeshFederationPublicEnv;
    const p = await buildMeshFederationPublicAsync(env, {
      resolvedPeers: resolvedStaticHs256(env),
    });
    expect(p.enabled).toBe(true);
    expect(p.phase).toBe("2.0-config");
    expect(p.federationInboundAllowlistActive).toBe(false);
    expect(p.sharedSecretConfigured).toBe(false);
    expect(p.jsonRpcProxy).toBeNull();
    expect(p.directoryPath).toBe("/api/mesh/federation/directory");
    expect(p.configuredPeerCount).toBe(1);
    expect(p.peerHostnames).toEqual(["pilox.other"]);
    expect(p.wanMesh?.publicDescriptorPath).toBe("/.well-known/pilox-mesh.json");
    expect(p.federatedInboundJsonRpcPath).toBe(
      "/api/a2a/federated/jsonrpc"
    );
  });

  it("enables transport phase when shared secret is set", async () => {
    const env = {
      ...FED_JWT_DEFAULTS,
      MESH_FEDERATION_ENABLED: true,
      MESH_FEDERATION_PEERS: "https://a.example",
      MESH_FEDERATION_SHARED_SECRET: "s".repeat(32),
      MESH_FEDERATION_RATE_LIMIT_MAX: 50,
      MESH_FEDERATION_RATE_LIMIT_WINDOW_MS: 30_000,
      MESH_FEDERATION_INBOUND_ALLOWLIST: "10.0.0.0/8",
      MESH_FEDERATION_JWT_TTL_SECONDS: 120,
      MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS: 90,
      MESH_FEDERATION_JWT_REQUIRE_JTI: true,
      MESH_FEDERATION_JWT_REQUIRE_AUDIENCE: true,
      MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET: true,
      MESH_FEDERATION_PROXY_SEND_SECRET: false,
      AUTH_URL: "https://a.example",
      MESH_FEDERATION_JWT_AUDIENCE: "",
    } as MeshFederationPublicEnv;
    const p = await buildMeshFederationPublicAsync(env, {
      resolvedPeers: resolvedStaticHs256(env),
    });
    expect(p.phase).toBe("2.1-transport");
    expect(p.federationInboundAllowlistActive).toBe(true);
    expect(p.sharedSecretConfigured).toBe(true);
    expect(p.jsonRpcProxy?.path).toBe("/api/mesh/federation/proxy/jsonrpc");
    expect(p.jsonRpcProxy?.jwtTtlSeconds).toBe(120);
    expect(p.jsonRpcProxy?.jwtClockSkewLeewaySeconds).toBe(90);
    expect(p.jsonRpcProxy?.jwtAudience).toBe("https://a.example");
    expect(p.jsonRpcProxy?.jwtRequireAudience).toBe(true);
    expect(p.jsonRpcProxy?.jwtRequireJti).toBe(true);
    expect(p.jsonRpcProxy?.inboundAllowLegacySecret).toBe(true);
    expect(p.jsonRpcProxy?.proxySendSharedSecret).toBe(false);
    expect(p.jsonRpcProxy?.jwtAlg).toBe("HS256");
    expect(p.jsonRpcProxy?.localEd25519PublicKeyHex).toBeNull();
    expect(p.jsonRpcProxy?.proxyOperatorTokenRequired).toBe(false);
    expect(p.jsonRpcProxy?.rateLimit).toEqual({
      maxRequests: 50,
      windowMs: 30_000,
    });
    expect(p.federatedInboundJsonRpcPath).toBe(
      "/api/a2a/federated/jsonrpc"
    );
  });

  it("enables Ed25519 transport when seed and peer public keys align", async () => {
    const { secretKey, publicKey } = ed25519.keygen();
    const seedHex = Buffer.from(secretKey).toString("hex");
    const peerPkHex = Buffer.from(publicKey).toString("hex");
    const env = {
      ...FED_JWT_DEFAULTS,
      MESH_FEDERATION_JWT_ALG: "Ed25519",
      MESH_FEDERATION_ED25519_SEED_HEX: seedHex,
      MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS: peerPkHex,
      MESH_FEDERATION_ENABLED: true,
      MESH_FEDERATION_PEERS: "https://peer.example",
      MESH_FEDERATION_SHARED_SECRET: undefined,
      MESH_FEDERATION_RATE_LIMIT_MAX: 100,
      MESH_FEDERATION_RATE_LIMIT_WINDOW_MS: 60_000,
      MESH_FEDERATION_INBOUND_ALLOWLIST: "",
      MESH_FEDERATION_JWT_TTL_SECONDS: 300,
      MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS: 60,
      MESH_FEDERATION_JWT_REQUIRE_JTI: true,
      MESH_FEDERATION_JWT_REQUIRE_AUDIENCE: true,
      MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET: true,
      MESH_FEDERATION_PROXY_SEND_SECRET: false,
      AUTH_URL: "https://self.example",
      MESH_FEDERATION_JWT_AUDIENCE: "",
    } as MeshFederationPublicEnv;
    const p = await buildMeshFederationPublicAsync(env, {
      resolvedPeers: resolvedStaticEd25519(env),
    });
    expect(p.phase).toBe("2.1-transport");
    expect(p.jsonRpcProxy?.jwtAlg).toBe("Ed25519");
    expect(p.jsonRpcProxy?.localEd25519PublicKeyHex).toBe(
      getFederationEd25519PublicKeyHexFromSeed(seedHex)
    );
  });

  it("uses MESH_FEDERATION_JWT_AUDIENCE for jwtAudience when set", async () => {
    const env = {
      ...FED_JWT_DEFAULTS,
      MESH_FEDERATION_ENABLED: true,
      MESH_FEDERATION_PEERS: "https://z.example",
      MESH_FEDERATION_SHARED_SECRET: "z".repeat(32),
      MESH_FEDERATION_RATE_LIMIT_MAX: 100,
      MESH_FEDERATION_RATE_LIMIT_WINDOW_MS: 60_000,
      MESH_FEDERATION_INBOUND_ALLOWLIST: "",
      MESH_FEDERATION_JWT_TTL_SECONDS: 300,
      MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS: 60,
      MESH_FEDERATION_JWT_REQUIRE_JTI: true,
      MESH_FEDERATION_JWT_REQUIRE_AUDIENCE: true,
      MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET: true,
      MESH_FEDERATION_PROXY_SEND_SECRET: false,
      AUTH_URL: "https://internal:3000",
      MESH_FEDERATION_JWT_AUDIENCE: "https://edge.pilox.example",
    } as MeshFederationPublicEnv;
    const p = await buildMeshFederationPublicAsync(env, {
      resolvedPeers: resolvedStaticHs256(env),
    });
    expect(p.jsonRpcProxy?.jwtAudience).toBe("https://edge.pilox.example");
  });

  it("directoryPath null when federation disabled", async () => {
    const p = await buildMeshFederationPublicAsync({
      ...FED_JWT_DEFAULTS,
      MESH_FEDERATION_ENABLED: false,
      MESH_FEDERATION_PEERS: "",
      MESH_FEDERATION_SHARED_SECRET: undefined,
      MESH_FEDERATION_RATE_LIMIT_MAX: 100,
      MESH_FEDERATION_RATE_LIMIT_WINDOW_MS: 60_000,
      MESH_FEDERATION_INBOUND_ALLOWLIST: "",
      MESH_FEDERATION_JWT_TTL_SECONDS: 300,
      MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS: 60,
      MESH_FEDERATION_JWT_REQUIRE_JTI: true,
      MESH_FEDERATION_JWT_REQUIRE_AUDIENCE: true,
      MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET: true,
      MESH_FEDERATION_PROXY_SEND_SECRET: false,
      AUTH_URL: "https://app.pilox.test",
      MESH_FEDERATION_JWT_AUDIENCE: "",
    } as MeshFederationPublicEnv);
    expect(p.directoryPath).toBeNull();
    expect(p.federationInboundAllowlistActive).toBe(false);
    expect(p.federatedInboundJsonRpcPath).toBeNull();
    expect(p.wanMesh).toBeUndefined();
  });
});
