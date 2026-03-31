import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519";
import { hexToBytes } from "@/lib/hex";

/** Separate from `Authorization: Bearer` (API tokens). */
export const MESH_FEDERATION_JWT_HEADER = "x-pilox-federation-jwt";

export const MESH_FEDERATION_JWT_ISS = "pilox-mesh-federation";
export const MESH_FEDERATION_JWT_SUB = "federation-peer";

/**
 * Accept `exp` up to this many seconds in the past, and reject `iat` more than this many seconds in the future,
 * relative to the verifier wall clock (skew between paired nodes / containers).
 */
export const MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS = 60;

/** Reject absurdly large tokens before HMAC / JSON work (DoS hardening). */
export const MESH_FEDERATION_JWT_MAX_RAW_LENGTH = 8192;

function b64urlEncode(data: string | Buffer): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecodeToBuffer(s: string): Buffer | null {
  try {
    let b = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (b.length % 4)) % 4;
    if (pad) b += "=".repeat(pad);
    return Buffer.from(b, "base64");
  } catch {
    return null;
  }
}

/**
 * @param audience Target Pilox origin (`https://peer.example`) — stored as JWT `aud` so the token cannot be replayed on another instance. Omit only for tests / legacy mints.
 */
export function mintMeshFederationJwt(
  secret: string,
  ttlSeconds: number,
  audience?: string
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload: Record<string, unknown> = {
    iss: MESH_FEDERATION_JWT_ISS,
    sub: MESH_FEDERATION_JWT_SUB,
    jti: randomUUID(),
    iat: now,
    exp: now + ttlSeconds,
  };
  if (audience !== undefined && audience !== "") {
    payload.aud = audience;
  }
  const h = b64urlEncode(JSON.stringify(header));
  const p = b64urlEncode(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const sig = createHmac("sha256", secret).update(data, "utf8").digest();
  return `${data}.${b64urlEncode(sig)}`;
}

export type MeshFederationJwtVerifyOk = {
  ok: true;
  /** Present when payload carried `jti` (required for replay protection when `requireJti` is true). */
  jti: string | null;
  exp: number;
  /** JWT `iss` (trimmed, bounded); Ed25519 mode = peer origin; HS256 = fixed federation issuer string. */
  iss: string | null;
};

export type MeshFederationJwtVerifyResult =
  | MeshFederationJwtVerifyOk
  | {
      ok: false;
      reason:
        | "malformed"
        | "bad_sig"
        | "bad_claims"
        | "expired"
        | "bad_audience"
        | "not_yet_valid"
        | "wrong_algorithm";
    };

export type MeshFederationJwtVerifyOptions = {
  clockSkewLeewaySeconds?: number;
  /**
   * When the JWT includes `aud`, it must equal this string (this instance's public API origin).
   * When `requireAudience` is false, tokens without `aud` are still accepted (not recommended in production).
   */
  expectedAudience?: string;
  /** When true, JWT must include `aud` matching `expectedAudience` (non-empty). */
  requireAudience?: boolean;
  /** When true, JWT must include a non-empty `jti` string (bounded length). */
  requireJti?: boolean;
};

export type MeshFederationJwtVerifyCtx =
  | { mode: "HS256"; secret: string }
  | {
      mode: "Ed25519";
      peerOrigins: string[];
      peerPublicKeys: Uint8Array[];
    };

function decodeJwtHeaderJson(
  encH: string
): Record<string, unknown> | null {
  const buf = b64urlDecodeToBuffer(encH);
  if (!buf) return null;
  try {
    return JSON.parse(buf.toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function validateMeshFederationJwtClaims(
  payload: Record<string, unknown>,
  options: MeshFederationJwtVerifyOptions | undefined,
  issRule:
    | { kind: "constant"; value: string }
    | { kind: "peerOriginMustMatchSigner" }
): MeshFederationJwtVerifyResult {
  const clockSkewLeewaySeconds =
    options?.clockSkewLeewaySeconds ??
    MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS;
  const expectedAudience = options?.expectedAudience;
  const requireAudience = options?.requireAudience === true;
  const requireJti = options?.requireJti === true;

  if (issRule.kind === "constant") {
    if (payload.iss !== issRule.value) return { ok: false, reason: "bad_claims" };
  } else {
    if (typeof payload.iss !== "string" || payload.iss.length < 1) {
      return { ok: false, reason: "bad_claims" };
    }
  }
  if (payload.sub !== MESH_FEDERATION_JWT_SUB)
    return { ok: false, reason: "bad_claims" };
  const exp = payload.exp;
  const iat = payload.iat;
  if (typeof exp !== "number" || typeof iat !== "number") {
    return { ok: false, reason: "bad_claims" };
  }
  const now = Math.floor(Date.now() / 1000);
  const skew = clockSkewLeewaySeconds;
  if (now > exp + skew) return { ok: false, reason: "expired" };
  if (iat > now + skew) return { ok: false, reason: "bad_claims" };

  if (payload.nbf !== undefined) {
    if (typeof payload.nbf !== "number") return { ok: false, reason: "bad_claims" };
    if (now + skew < payload.nbf) return { ok: false, reason: "not_yet_valid" };
  }

  const expAud = expectedAudience?.trim() ?? "";
  if (requireAudience) {
    if (expAud.length === 0) return { ok: false, reason: "bad_audience" };
    if (typeof payload.aud !== "string" || payload.aud.length === 0) {
      return { ok: false, reason: "bad_audience" };
    }
    if (payload.aud !== expAud) return { ok: false, reason: "bad_audience" };
  } else if (payload.aud !== undefined) {
    if (typeof payload.aud !== "string")
      return { ok: false, reason: "bad_claims" };
    if (
      !expectedAudience ||
      expectedAudience.length === 0 ||
      payload.aud !== expectedAudience
    ) {
      return { ok: false, reason: "bad_audience" };
    }
  }

  let jti: string | null = null;
  if (payload.jti !== undefined) {
    if (typeof payload.jti !== "string" || payload.jti.length < 1)
      return { ok: false, reason: "bad_claims" };
    if (payload.jti.length > 128) return { ok: false, reason: "bad_claims" };
    jti = payload.jti;
  } else if (requireJti) {
    return { ok: false, reason: "bad_claims" };
  }

  let iss: string | null = null;
  if (typeof payload.iss === "string") {
    const t = payload.iss.trim();
    if (t.length > 0) iss = t.slice(0, 512);
  }

  return { ok: true, jti, exp, iss };
}

/**
 * Verifies federation JWT for the configured algorithm (HS256 shared secret vs Ed25519 peer keys).
 */
export function verifyMeshFederationJwtUnified(
  token: string,
  ctx: MeshFederationJwtVerifyCtx,
  options?: MeshFederationJwtVerifyOptions
): MeshFederationJwtVerifyResult {
  const trimmed = token.trim();
  if (trimmed.length > MESH_FEDERATION_JWT_MAX_RAW_LENGTH) {
    return { ok: false, reason: "malformed" };
  }
  const parts = trimmed.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [encH, encP, encS] = parts;
  if (!encH || !encP || !encS) return { ok: false, reason: "malformed" };
  const data = `${encH}.${encP}`;
  const header = decodeJwtHeaderJson(encH);
  if (!header) return { ok: false, reason: "malformed" };
  const alg = header.alg;

  const sigBuf = b64urlDecodeToBuffer(encS);
  if (!sigBuf?.length) return { ok: false, reason: "malformed" };

  const payloadBuf = b64urlDecodeToBuffer(encP);
  if (!payloadBuf) return { ok: false, reason: "malformed" };
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadBuf.toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (ctx.mode === "HS256") {
    if (alg !== "HS256") return { ok: false, reason: "wrong_algorithm" };
    const expected = createHmac("sha256", ctx.secret)
      .update(data, "utf8")
      .digest();
    if (
      sigBuf.length !== expected.length ||
      !timingSafeEqual(sigBuf, expected)
    ) {
      return { ok: false, reason: "bad_sig" };
    }
    return validateMeshFederationJwtClaims(payload, options, {
      kind: "constant",
      value: MESH_FEDERATION_JWT_ISS,
    });
  }

  if (alg !== "EdDSA" && alg !== "Ed25519") {
    return { ok: false, reason: "wrong_algorithm" };
  }
  if (typeof payload.iss !== "string" || payload.iss.length < 1) {
    return { ok: false, reason: "bad_claims" };
  }
  const idx = ctx.peerOrigins.indexOf(payload.iss);
  if (idx < 0 || idx >= ctx.peerPublicKeys.length) {
    return { ok: false, reason: "bad_claims" };
  }
  const pub = ctx.peerPublicKeys[idx]!;
  if (sigBuf.length !== 64) return { ok: false, reason: "bad_sig" };
  const msgBytes = new TextEncoder().encode(data);
  let sigOk = false;
  try {
    sigOk = ed25519.verify(sigBuf, msgBytes, pub);
  } catch {
    return { ok: false, reason: "bad_sig" };
  }
  if (!sigOk) return { ok: false, reason: "bad_sig" };
  return validateMeshFederationJwtClaims(payload, options, {
    kind: "peerOriginMustMatchSigner",
  });
}

export function mintMeshFederationJwtEd25519(
  seedHex: string,
  ttlSeconds: number,
  audience: string,
  issuerOrigin: string
): string {
  const sk = hexToBytes(seedHex.trim());
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "EdDSA", typ: "JWT" };
  const payload: Record<string, unknown> = {
    iss: issuerOrigin,
    sub: MESH_FEDERATION_JWT_SUB,
    jti: randomUUID(),
    iat: now,
    exp: now + ttlSeconds,
    aud: audience,
  };
  const h = b64urlEncode(JSON.stringify(header));
  const p = b64urlEncode(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const sig = ed25519.sign(new TextEncoder().encode(data), sk);
  return `${data}.${b64urlEncode(Buffer.from(sig))}`;
}

export function verifyMeshFederationJwt(
  token: string,
  secret: string,
  options?: MeshFederationJwtVerifyOptions
): MeshFederationJwtVerifyResult {
  return verifyMeshFederationJwtUnified(
    token,
    { mode: "HS256", secret },
    options
  );
}
