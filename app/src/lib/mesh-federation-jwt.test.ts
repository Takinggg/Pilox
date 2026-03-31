import { describe, it, expect, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  mintMeshFederationJwt,
  verifyMeshFederationJwt,
  MESH_FEDERATION_JWT_ISS,
  MESH_FEDERATION_JWT_MAX_RAW_LENGTH,
} from "./mesh-federation-jwt";

const secret = "k".repeat(32);

describe("mesh-federation-jwt", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("mints and verifies a JWT", () => {
    const t = mintMeshFederationJwt(secret, 300);
    expect(t.split(".")).toHaveLength(3);
    expect(
      verifyMeshFederationJwt(t, secret, { requireAudience: false })
    ).toMatchObject({
      ok: true,
      jti: expect.any(String),
      exp: expect.any(Number),
      iss: MESH_FEDERATION_JWT_ISS,
    });
  });

  it("rejects tampered payload", () => {
    const t = mintMeshFederationJwt(secret, 300);
    const [a, b, c] = t.split(".");
    const tampered = `${a}.${b.slice(0, -3)}xxx.${c}`;
    expect(
      verifyMeshFederationJwt(tampered, secret, { requireAudience: false }).ok
    ).toBe(false);
  });

  it("rejects wrong secret", () => {
    const t = mintMeshFederationJwt(secret, 300);
    expect(
      verifyMeshFederationJwt(t, "z".repeat(32), { requireAudience: false }).ok
    ).toBe(false);
  });

  it("rejects expired JWT", () => {
    const t = mintMeshFederationJwt(secret, -(60 + 15));
    const r = verifyMeshFederationJwt(t, secret, { requireAudience: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("expired");
  });

  it("accepts JWT slightly after exp within clock-skew leeway", () => {
    vi.useFakeTimers({ now: new Date("2025-06-01T12:00:00.000Z") });
    const t = mintMeshFederationJwt(secret, 2);
    vi.setSystemTime(new Date("2025-06-01T12:00:10.000Z"));
    expect(
      verifyMeshFederationJwt(t, secret, { requireAudience: false }).ok
    ).toBe(true);
  });

  it("rejects post-exp JWT when leeway is zero", () => {
    vi.useFakeTimers({ now: new Date("2025-06-01T12:00:00.000Z") });
    const t = mintMeshFederationJwt(secret, 2);
    vi.setSystemTime(new Date("2025-06-01T12:00:10.000Z"));
    const r = verifyMeshFederationJwt(t, secret, {
      clockSkewLeewaySeconds: 0,
      requireAudience: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("expired");
  });

  it("rejects JWT far past exp (beyond leeway)", () => {
    vi.useFakeTimers({ now: new Date("2025-06-01T12:00:00.000Z") });
    const t = mintMeshFederationJwt(secret, 1);
    vi.setSystemTime(new Date("2025-06-01T12:02:30.000Z"));
    const r = verifyMeshFederationJwt(t, secret, { requireAudience: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("expired");
  });

  it("rejects wrong iss in payload", () => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }))
      .toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        iss: "evil",
        sub: "federation-peer",
        jti: "00000000-0000-4000-8000-000000000001",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60,
      })
    ).toString("base64url");
    const data = `${header}.${payload}`;
    const sig = createHmac("sha256", secret).update(data, "utf8").digest("base64url");
    const t = `${data}.${sig}`;
    const r = verifyMeshFederationJwt(t, secret, { requireAudience: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_claims");
  });

  it("verifies aud when minted with audience", () => {
    const t = mintMeshFederationJwt(secret, 60, "https://peer.example");
    const v = verifyMeshFederationJwt(t, secret, {
      expectedAudience: "https://peer.example",
      requireAudience: true,
    });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.jti).toBeTruthy();
  });

  it("rejects aud mismatch", () => {
    const t = mintMeshFederationJwt(secret, 60, "https://a.example");
    const r = verifyMeshFederationJwt(t, secret, {
      expectedAudience: "https://b.example",
      requireAudience: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_audience");
  });

  it("rejects JWT with aud when expectedAudience is not configured", () => {
    const t = mintMeshFederationJwt(secret, 60, "https://peer.example");
    const r = verifyMeshFederationJwt(t, secret, { expectedAudience: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_audience");
  });

  it("rejects missing jti when requireJti is true", () => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }))
      .toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
      JSON.stringify({
        iss: "pilox-mesh-federation",
        sub: "federation-peer",
        iat: now,
        exp: now + 60,
      })
    ).toString("base64url");
    const data = `${header}.${payload}`;
    const sig = createHmac("sha256", secret).update(data, "utf8").digest("base64url");
    const t = `${data}.${sig}`;
    const r = verifyMeshFederationJwt(t, secret, {
      requireJti: true,
      requireAudience: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_claims");
  });

  it("rejects token without aud when requireAudience is true", () => {
    const t = mintMeshFederationJwt(secret, 60);
    const r = verifyMeshFederationJwt(t, secret, {
      expectedAudience: "https://peer.example",
      requireAudience: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_audience");
  });

  it("rejects JWT when nbf is in the future", () => {
    vi.useFakeTimers({ now: new Date("2025-06-01T12:00:00.000Z") });
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }))
      .toString("base64url");
    const iat = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
      JSON.stringify({
        iss: "pilox-mesh-federation",
        sub: "federation-peer",
        jti: "00000000-0000-4000-8000-000000000002",
        aud: "https://peer.example",
        iat,
        nbf: iat + 120,
        exp: iat + 300,
      })
    ).toString("base64url");
    const data = `${header}.${payload}`;
    const sig = createHmac("sha256", secret).update(data, "utf8").digest("base64url");
    const t = `${data}.${sig}`;
    const r = verifyMeshFederationJwt(t, secret, {
      expectedAudience: "https://peer.example",
      requireAudience: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_yet_valid");
  });

  it("rejects oversized raw JWT string", () => {
    const t = "a".repeat(MESH_FEDERATION_JWT_MAX_RAW_LENGTH + 1);
    const r = verifyMeshFederationJwt(t, secret, { requireAudience: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("malformed");
  });
});
