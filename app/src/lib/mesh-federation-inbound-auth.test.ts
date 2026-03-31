import { describe, it, expect, beforeEach, vi } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";

const { mockConsume } = vi.hoisted(() => ({
  mockConsume: vi.fn().mockResolvedValue({ ok: true as const }),
}));

vi.mock("@/lib/mesh-federation-jwt-replay", () => ({
  consumeFederationJwtJtiOnce: (...args: unknown[]) => mockConsume(...args),
}));

import { clearFederationPeersResolveMemoryCache } from "./mesh-federation-resolve";
import { resolveMeshFederationInboundAuth } from "./mesh-federation-inbound-auth";
import {
  mintMeshFederationJwt,
  mintMeshFederationJwtEd25519,
  MESH_FEDERATION_JWT_ISS,
} from "./mesh-federation-jwt";
import type { Env } from "./env";

const secret = "a".repeat(32);

function envSlice(
  over: Partial<
    Pick<
      Env,
      | "MESH_FEDERATION_ENABLED"
      | "MESH_FEDERATION_SHARED_SECRET"
      | "MESH_FEDERATION_INBOUND_ALLOWLIST"
      | "MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS"
      | "AUTH_URL"
      | "MESH_FEDERATION_JWT_AUDIENCE"
      | "MESH_FEDERATION_JWT_REQUIRE_JTI"
      | "MESH_FEDERATION_JWT_REQUIRE_AUDIENCE"
      | "MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET"
      | "MESH_FEDERATION_JWT_ALG"
      | "MESH_FEDERATION_PEERS"
      | "MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS"
      | "MESH_FEDERATION_MAX_PEERS"
      | "MESH_FEDERATION_PEERS_MANIFEST_URL"
      | "MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX"
      | "MESH_FEDERATION_PEERS_MANIFEST_REFRESH_SECONDS"
      | "MESH_FEDERATION_PEERS_MANIFEST_FETCH_TIMEOUT_MS"
    >
  >
): Pick<
  Env,
  | "MESH_FEDERATION_ENABLED"
  | "MESH_FEDERATION_SHARED_SECRET"
  | "MESH_FEDERATION_INBOUND_ALLOWLIST"
  | "MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS"
  | "AUTH_URL"
  | "MESH_FEDERATION_JWT_AUDIENCE"
  | "MESH_FEDERATION_JWT_REQUIRE_JTI"
  | "MESH_FEDERATION_JWT_REQUIRE_AUDIENCE"
  | "MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET"
  | "MESH_FEDERATION_JWT_ALG"
  | "MESH_FEDERATION_PEERS"
  | "MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS"
  | "MESH_FEDERATION_MAX_PEERS"
  | "MESH_FEDERATION_PEERS_MANIFEST_URL"
  | "MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX"
  | "MESH_FEDERATION_PEERS_MANIFEST_REFRESH_SECONDS"
  | "MESH_FEDERATION_PEERS_MANIFEST_FETCH_TIMEOUT_MS"
> {
  return {
    MESH_FEDERATION_ENABLED: over.MESH_FEDERATION_ENABLED ?? true,
    MESH_FEDERATION_SHARED_SECRET: over.MESH_FEDERATION_SHARED_SECRET ?? secret,
    MESH_FEDERATION_INBOUND_ALLOWLIST:
      over.MESH_FEDERATION_INBOUND_ALLOWLIST ?? "",
    MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS:
      over.MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS ?? 60,
    AUTH_URL: over.AUTH_URL ?? "https://pilox-inbound.test",
    MESH_FEDERATION_JWT_AUDIENCE: over.MESH_FEDERATION_JWT_AUDIENCE ?? "",
    MESH_FEDERATION_JWT_REQUIRE_JTI:
      over.MESH_FEDERATION_JWT_REQUIRE_JTI ?? true,
    MESH_FEDERATION_JWT_REQUIRE_AUDIENCE:
      over.MESH_FEDERATION_JWT_REQUIRE_AUDIENCE ?? true,
    MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET:
      over.MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET ?? true,
    MESH_FEDERATION_JWT_ALG: over.MESH_FEDERATION_JWT_ALG ?? "HS256",
    MESH_FEDERATION_PEERS: over.MESH_FEDERATION_PEERS ?? "",
    MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS:
      over.MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS ?? "",
    MESH_FEDERATION_MAX_PEERS: over.MESH_FEDERATION_MAX_PEERS ?? 512,
    MESH_FEDERATION_PEERS_MANIFEST_URL:
      over.MESH_FEDERATION_PEERS_MANIFEST_URL ?? undefined,
    MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX:
      over.MESH_FEDERATION_PEERS_MANIFEST_PUBLIC_KEY_HEX ?? "",
    MESH_FEDERATION_PEERS_MANIFEST_REFRESH_SECONDS:
      over.MESH_FEDERATION_PEERS_MANIFEST_REFRESH_SECONDS ?? 300,
    MESH_FEDERATION_PEERS_MANIFEST_FETCH_TIMEOUT_MS:
      over.MESH_FEDERATION_PEERS_MANIFEST_FETCH_TIMEOUT_MS ?? 15_000,
  };
}

const aud = "https://pilox-inbound.test";

describe("mesh-federation-inbound-auth", () => {
  beforeEach(() => {
    clearFederationPeersResolveMemoryCache();
    mockConsume.mockReset();
    mockConsume.mockResolvedValue({ ok: true });
  });

  it("returns undefined when neither header is present", async () => {
    await expect(
      resolveMeshFederationInboundAuth(
        envSlice({}),
        "viewer",
        { jwt: null, secret: null },
        "1.1.1.1"
      )
    ).resolves.toBeUndefined();
  });

  it("400 when both JWT and secret are sent", async () => {
    const jwt = mintMeshFederationJwt(secret, 60, aud);
    const r = await resolveMeshFederationInboundAuth(
      envSlice({}),
      "viewer",
      { jwt, secret },
      "10.0.0.1"
    );
    expect(r && "authorized" in r && !r.authorized).toBe(true);
    if (r && "response" in r) expect(r.response.status).toBe(400);
  });

  it("401 when header sent but federation not configured", async () => {
    const r = await resolveMeshFederationInboundAuth(
      envSlice({
        MESH_FEDERATION_ENABLED: false,
        MESH_FEDERATION_SHARED_SECRET: secret,
      }),
      "viewer",
      { jwt: null, secret },
      "1.1.1.1"
    );
    expect(r).toBeDefined();
    expect(r && "authorized" in r && !r.authorized).toBe(true);
  });

  it("403 when legacy secret inbound is disabled", async () => {
    const r = await resolveMeshFederationInboundAuth(
      envSlice({ MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET: false }),
      "viewer",
      { jwt: null, secret },
      "10.0.0.1"
    );
    expect(r && "authorized" in r && !r.authorized).toBe(true);
    if (r && "response" in r) expect(r.response.status).toBe(403);
  });

  it("accepts matching secret as operator-equivalent", async () => {
    const r = await resolveMeshFederationInboundAuth(
      envSlice({}),
      "viewer",
      { jwt: null, secret },
      "10.0.0.1"
    );
    expect(r && "authorized" in r && r.authorized).toBe(true);
    if (r && "authorized" in r && r.authorized) {
      expect(r.user.id).toBe("pilox-federated");
      expect(r.authSource).toBe("federation");
      expect(r.federationInboundAuth).toBe("legacy_secret");
      expect(r.federationJwtIss).toBeNull();
      expect(r.federationJwtAlg).toBeNull();
    }
    expect(mockConsume).not.toHaveBeenCalled();
  });

  it("accepts valid JWT and consumes jti once", async () => {
    const jwt = mintMeshFederationJwt(secret, 120, aud);
    const r = await resolveMeshFederationInboundAuth(
      envSlice({}),
      "viewer",
      { jwt, secret: null },
      "10.0.0.1"
    );
    expect(r && "authorized" in r && r.authorized).toBe(true);
    expect(mockConsume).toHaveBeenCalledTimes(1);
    if (r && "authorized" in r && r.authorized) {
      expect(r.federationInboundAuth).toBe("jwt");
      expect(r.federationJwtAlg).toBe("HS256");
      expect(r.federationJwtIss).toBe(MESH_FEDERATION_JWT_ISS);
    }
  });

  it("401 when same JWT jti is replayed", async () => {
    mockConsume
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, reason: "replay" });
    const jwt = mintMeshFederationJwt(secret, 120, aud);
    const e = envSlice({});
    const r1 = await resolveMeshFederationInboundAuth(
      e,
      "viewer",
      { jwt, secret: null },
      "10.0.0.1"
    );
    expect(r1 && "authorized" in r1 && r1.authorized).toBe(true);
    const r2 = await resolveMeshFederationInboundAuth(
      e,
      "viewer",
      { jwt, secret: null },
      "10.0.0.1"
    );
    expect(r2 && "authorized" in r2 && !r2.authorized).toBe(true);
    if (r2 && "response" in r2) expect(r2.response.status).toBe(401);
  });

  it("503 when Redis replay check fails", async () => {
    mockConsume.mockResolvedValue({ ok: false, reason: "redis_error" });
    const jwt = mintMeshFederationJwt(secret, 120, aud);
    const r = await resolveMeshFederationInboundAuth(
      envSlice({}),
      "viewer",
      { jwt, secret: null },
      "10.0.0.1"
    );
    expect(r && "authorized" in r && !r.authorized).toBe(true);
    if (r && "response" in r) expect(r.response.status).toBe(503);
  });

  it("accepts JWT when aud matches this instance", async () => {
    const jwt = mintMeshFederationJwt(secret, 120, aud);
    const r = await resolveMeshFederationInboundAuth(
      envSlice({ AUTH_URL: "https://pilox-inbound.test" }),
      "viewer",
      { jwt, secret: null },
      "10.0.0.1"
    );
    expect(r && "authorized" in r && r.authorized).toBe(true);
  });

  it("accepts Ed25519 JWT when peer origin and public key match env", async () => {
    const { secretKey, publicKey } = ed25519.keygen();
    const peerSkHex = Buffer.from(secretKey).toString("hex");
    const peerPkHex = Buffer.from(publicKey).toString("hex");
    const peerOrigin = "https://peer-sender.example";
    const jwt = mintMeshFederationJwtEd25519(
      peerSkHex,
      120,
      aud,
      peerOrigin
    );
    const r = await resolveMeshFederationInboundAuth(
      envSlice({
        MESH_FEDERATION_JWT_ALG: "Ed25519",
        MESH_FEDERATION_PEERS: peerOrigin,
        MESH_FEDERATION_PEER_ED25519_PUBLIC_KEYS: peerPkHex,
      }),
      "viewer",
      { jwt, secret: null },
      "10.0.0.1"
    );
    expect(r && "authorized" in r && r.authorized).toBe(true);
    expect(mockConsume).toHaveBeenCalledTimes(1);
    if (r && "authorized" in r && r.authorized) {
      expect(r.federationInboundAuth).toBe("jwt");
      expect(r.federationJwtAlg).toBe("Ed25519");
      expect(r.federationJwtIss).toBe(peerOrigin);
    }
  });

  it("401 when JWT omits aud and REQUIRE_AUDIENCE is true", async () => {
    const jwt = mintMeshFederationJwt(secret, 120);
    const r = await resolveMeshFederationInboundAuth(
      envSlice({}),
      "viewer",
      { jwt, secret: null },
      "10.0.0.1"
    );
    expect(r && "authorized" in r && !r.authorized).toBe(true);
    if (r && "response" in r) expect(r.response.status).toBe(401);
    expect(mockConsume).not.toHaveBeenCalled();
  });

  it("rejects JWT when aud mismatches", async () => {
    const jwt = mintMeshFederationJwt(secret, 120, "https://evil.example");
    const r = await resolveMeshFederationInboundAuth(
      envSlice({}),
      "viewer",
      { jwt, secret: null },
      "10.0.0.1"
    );
    expect(r && "authorized" in r && !r.authorized).toBe(true);
    if (r && "response" in r) expect(r.response.status).toBe(401);
    expect(mockConsume).not.toHaveBeenCalled();
  });

  it("uses MESH_FEDERATION_JWT_AUDIENCE for aud check when set", async () => {
    const jwt = mintMeshFederationJwt(secret, 60, "https://edge.example");
    const r = await resolveMeshFederationInboundAuth(
      envSlice({
        AUTH_URL: "https://internal:3000",
        MESH_FEDERATION_JWT_AUDIENCE: "https://edge.example",
      }),
      "viewer",
      { jwt, secret: null },
      "10.0.0.1"
    );
    expect(r && "authorized" in r && r.authorized).toBe(true);
  });

  it("rejects expired JWT", async () => {
    const jwt = mintMeshFederationJwt(secret, -(60 + 15), aud);
    const r = await resolveMeshFederationInboundAuth(
      envSlice({}),
      "viewer",
      { jwt, secret: null },
      "10.0.0.1"
    );
    expect(r && "authorized" in r && !r.authorized).toBe(true);
  });

  it("rejects wrong secret", async () => {
    const r = await resolveMeshFederationInboundAuth(
      envSlice({}),
      "viewer",
      { jwt: null, secret: "wrong".repeat(10) },
      "10.0.0.1"
    );
    expect(r && "authorized" in r && !r.authorized).toBe(true);
  });

  it("403 when client IP not on inbound allowlist", async () => {
    const r = await resolveMeshFederationInboundAuth(
      envSlice({ MESH_FEDERATION_INBOUND_ALLOWLIST: "10.0.0.1" }),
      "viewer",
      { jwt: null, secret },
      "10.0.0.2"
    );
    expect(r && "authorized" in r && !r.authorized).toBe(true);
  });

  it("allows federated auth when IP matches allowlist", async () => {
    const r = await resolveMeshFederationInboundAuth(
      envSlice({ MESH_FEDERATION_INBOUND_ALLOWLIST: "10.0.0.1,10.0.0.0/24" }),
      "viewer",
      { jwt: null, secret },
      "10.0.0.50"
    );
    expect(r && "authorized" in r && r.authorized).toBe(true);
  });

  it("403 when instance requires admin for JSON-RPC", async () => {
    const r = await resolveMeshFederationInboundAuth(
      envSlice({}),
      "admin",
      { jwt: null, secret },
      "10.0.0.1"
    );
    expect(r && "authorized" in r && !r.authorized).toBe(true);
  });

  it("skips jti consume when REQUIRE_JTI false and token has no jti", async () => {
    const { verifyMeshFederationJwt } = await import("./mesh-federation-jwt");
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }))
      .toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
      JSON.stringify({
        iss: "pilox-mesh-federation",
        sub: "federation-peer",
        aud,
        iat: now,
        exp: now + 120,
      })
    ).toString("base64url");
    const { createHmac } = await import("node:crypto");
    const data = `${header}.${payload}`;
    const sig = createHmac("sha256", secret).update(data, "utf8").digest("base64url");
    const legacyJwt = `${data}.${sig}`;
    expect(
      verifyMeshFederationJwt(legacyJwt, secret, {
        requireJti: false,
        expectedAudience: aud,
        requireAudience: true,
      }).ok
    ).toBe(true);

    const r = await resolveMeshFederationInboundAuth(
      envSlice({ MESH_FEDERATION_JWT_REQUIRE_JTI: false }),
      "viewer",
      { jwt: legacyJwt, secret: null },
      "10.0.0.1"
    );
    expect(r && "authorized" in r && r.authorized).toBe(true);
    expect(mockConsume).not.toHaveBeenCalled();
  });

});
