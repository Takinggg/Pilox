import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { proxyA2AJsonRpcToPeerOrigin } from "./mesh-federation-proxy-outbound";
import { MESH_FEDERATION_SECRET_HEADER } from "./mesh-federation-inbound-auth";
import {
  MESH_FEDERATION_JWT_HEADER,
  verifyMeshFederationJwtUnified,
} from "./mesh-federation-jwt";

describe("proxyA2AJsonRpcToPeerOrigin", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to peer /api/a2a/jsonrpc with JWT and optional secret header", async () => {
    const shared = "x".repeat(32);
    const req = new Request("http://local/proxy", {
      headers: {
        "X-Request-Id": "rid-1",
        "X-Correlation-Id": "cid-1",
      },
    });
    await proxyA2AJsonRpcToPeerOrigin(
      "https://peer.example",
      '{"jsonrpc":"2.0","id":1,"method":"ping"}',
      {
        jwtAlg: "HS256",
        sharedSecret: shared,
        ed25519SeedHex: "",
        issuerOrigin: "https://caller.example",
        jwtTtlSeconds: 90,
        sendSharedSecret: true,
        forwardRequest: req,
      }
    );
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toBe("https://peer.example/api/a2a/jsonrpc");
    const init = call[1] as RequestInit;
    expect(init.method).toBe("POST");
    const h = init.headers as Record<string, string>;
    const jwt = h[MESH_FEDERATION_JWT_HEADER];
    expect(jwt).toBeTruthy();
    expect(
      verifyMeshFederationJwtUnified(jwt, { mode: "HS256", secret: shared }, {
        expectedAudience: "https://peer.example",
        requireAudience: true,
        requireJti: true,
      }).ok
    ).toBe(true);
    expect(h[MESH_FEDERATION_SECRET_HEADER]).toBe(shared);
    expect(h["X-Request-Id"]).toBe("rid-1");
    expect(h["X-Correlation-Id"]).toBe("cid-1");
  });

  it("omits secret header when sendSharedSecret is false", async () => {
    const shared = "y".repeat(32);
    await proxyA2AJsonRpcToPeerOrigin("https://peer.example", "{}", {
      jwtAlg: "HS256",
      sharedSecret: shared,
      ed25519SeedHex: "",
      issuerOrigin: "https://caller.example",
      jwtTtlSeconds: 60,
      sendSharedSecret: false,
    });
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const h = init.headers as Record<string, string>;
    expect(h[MESH_FEDERATION_JWT_HEADER]).toBeTruthy();
    expect(h[MESH_FEDERATION_SECRET_HEADER]).toBeUndefined();
  });

  it("mints Ed25519 JWT when jwtAlg is Ed25519", async () => {
    const { secretKey, publicKey } = ed25519.keygen();
    const seedHex = Buffer.from(secretKey).toString("hex");
    const issuer = "https://caller.example";
    const peerOrigin = "https://peer.example";
    await proxyA2AJsonRpcToPeerOrigin(peerOrigin, "{}", {
      jwtAlg: "Ed25519",
      sharedSecret: "x".repeat(32),
      ed25519SeedHex: seedHex,
      issuerOrigin: issuer,
      jwtTtlSeconds: 60,
      sendSharedSecret: false,
    });
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const h = init.headers as Record<string, string>;
    const jwt = h[MESH_FEDERATION_JWT_HEADER];
    expect(
      verifyMeshFederationJwtUnified(
        jwt,
        {
          mode: "Ed25519",
          peerOrigins: [issuer],
          peerPublicKeys: [publicKey],
        },
        {
          expectedAudience: peerOrigin,
          requireAudience: true,
          requireJti: true,
        }
      ).ok
    ).toBe(true);
  });
});
