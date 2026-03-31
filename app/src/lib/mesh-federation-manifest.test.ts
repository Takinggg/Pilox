import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { stableStringify } from "@/lib/mesh-envelope";
import {
  verifySignedManifestBody,
  fetchSignedFederationManifest,
  MAX_SIGNED_FEDERATION_MANIFEST_BYTES,
} from "@/lib/mesh-federation-manifest";

describe("mesh-federation-manifest", () => {
  it("accepts Ed25519-signed payload", () => {
    const { secretKey, publicKey } = ed25519.keygen();
    const payload = {
      v: 1 as const,
      issuedAt: "2025-03-20T00:00:00.000Z",
      peers: [{ origin: "https://pilox.a.example" }],
    };
    const msg = new TextEncoder().encode(stableStringify(payload));
    const sig = ed25519.sign(msg, secretKey);
    const body = JSON.stringify({
      payload,
      sigHex: Buffer.from(sig).toString("hex"),
    });
    const pkHex = Buffer.from(publicKey).toString("hex");
    const v = verifySignedManifestBody(body, pkHex);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.peers).toHaveLength(1);
  });

  it("rejects wrong key", () => {
    const { secretKey } = ed25519.keygen();
    const { publicKey: otherPk } = ed25519.keygen();
    const payload = { v: 1 as const, peers: [{ origin: "https://x.example" }] };
    const msg = new TextEncoder().encode(stableStringify(payload));
    const sig = ed25519.sign(msg, secretKey);
    const body = JSON.stringify({
      payload,
      sigHex: Buffer.from(sig).toString("hex"),
    });
    const v = verifySignedManifestBody(
      body,
      Buffer.from(otherPk).toString("hex")
    );
    expect(v.ok).toBe(false);
  });

  it("rejects tampered payload", () => {
    const { secretKey, publicKey } = ed25519.keygen();
    const payload = { v: 1 as const, peers: [{ origin: "https://ok.example" }] };
    const msg = new TextEncoder().encode(stableStringify(payload));
    const sig = ed25519.sign(msg, secretKey);
    const tampered = {
      payload: {
        ...payload,
        peers: [{ origin: "https://evil.example" }],
      },
      sigHex: Buffer.from(sig).toString("hex"),
    };
    const v = verifySignedManifestBody(
      JSON.stringify(tampered),
      Buffer.from(publicKey).toString("hex")
    );
    expect(v.ok).toBe(false);
  });
});

describe("fetchSignedFederationManifest", () => {
  const { publicKey } = ed25519.keygen();
  const pkHex = Buffer.from(publicKey).toString("hex");
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects Content-Length larger than cap", async () => {
    mockFetch.mockResolvedValue(
      new Response("", {
        status: 200,
        headers: {
          "content-length": String(MAX_SIGNED_FEDERATION_MANIFEST_BYTES + 1),
        },
      })
    );
    const r = await fetchSignedFederationManifest(
      "https://cdn.example/manifest.json",
      pkHex,
      5000
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("manifest_too_large");
  });

  it("rejects body stream over cap", async () => {
    const chunk = new Uint8Array(MAX_SIGNED_FEDERATION_MANIFEST_BYTES + 1);
    chunk.fill(32);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(chunk);
        controller.close();
      },
    });
    mockFetch.mockResolvedValue(new Response(stream, { status: 200 }));
    const r = await fetchSignedFederationManifest(
      "https://cdn.example/manifest.json",
      pkHex,
      5000
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("manifest_too_large");
  });

  it("rejects http manifest URL when NODE_ENV is not development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const r = await fetchSignedFederationManifest(
      "http://127.0.0.1/m.json",
      pkHex,
      1000
    );
    vi.unstubAllEnvs();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("manifest_http_forbidden_in_production");
    }
  });

  it("maps fetch failures to stable reasons (no Error.message leak)", async () => {
    const err = new Error("getaddrinfo ENOTFOUND internal.corp.example");
    err.name = "AbortError";
    mockFetch.mockRejectedValue(err);
    const r = await fetchSignedFederationManifest(
      "https://cdn.example/manifest.json",
      pkHex,
      5000
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("fetch_timeout");
    mockFetch.mockRejectedValue(new Error("network blew up"));
    const r2 = await fetchSignedFederationManifest(
      "https://cdn.example/manifest.json",
      pkHex,
      5000
    );
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe("fetch_error");
  });
});
