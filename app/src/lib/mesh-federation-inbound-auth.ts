import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { Env } from "@/lib/env";
import type { Role } from "@/lib/authorize";
import { parsePeerEd25519PublicKeysToBytes } from "@/lib/mesh-federation-ed25519";
import { resolveFederationPeers } from "@/lib/mesh-federation-resolve";
import { isFederationInboundIpAllowed } from "@/lib/mesh-federation-inbound-allowlist";
import { federationJwtExpectedAudience } from "@/lib/mesh-federation-jwt-audience";
import { consumeFederationJwtJtiOnce } from "@/lib/mesh-federation-jwt-replay";
import {
  verifyMeshFederationJwtUnified,
  MESH_FEDERATION_JWT_HEADER,
  type MeshFederationJwtVerifyOk,
} from "@/lib/mesh-federation-jwt";
import { federationSharedSecretReady } from "@/lib/mesh-federation-secret";
import { federationInboundJwtVerificationReadyAsync } from "@/lib/mesh-federation-transport-ready";

const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 3,
  operator: 2,
  viewer: 1,
};

/** Canonical header for legacy / simple peers — compare via `Headers.get` (lowercase key). */
export const MESH_FEDERATION_SECRET_HEADER = "x-pilox-federation-secret";

export { MESH_FEDERATION_JWT_HEADER };

export type MeshFederationJsonRpcAuthOk = {
  authorized: true;
  session: null;
  user: { id: string; name: string; email: null };
  role: "operator";
  ip: string;
  authSource: "federation";
  /** How the peer authenticated to this instance. */
  federationInboundAuth: "jwt" | "legacy_secret";
  /**
   * JWT `iss` when `federationInboundAuth === "jwt"` (peer origin in Ed25519 mode;
   * HS256 uses the fixed federation issuer constant — does not identify a specific peer).
   */
  federationJwtIss: string | null;
  federationJwtAlg: "HS256" | "Ed25519" | null;
};

function secretMatches(presented: string, expected: string): boolean {
  if (!presented || !expected || expected.length < 32) return false;
  const a = createHash("sha256").update(presented, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function federationDisabledResponse() {
  return {
    authorized: false as const,
    response: NextResponse.json(
      { error: "Unauthorized", message: "Federation inbound authentication failed." },
      { status: 401 }
    ),
  };
}

/**
 * Inbound mesh federation on `POST /api/a2a/jsonrpc`:
 * - **`X-Pilox-Federation-JWT`** — HS256 (shared secret) or Ed25519 (per-peer public keys), per `MESH_FEDERATION_JWT_ALG`.
 * - **`X-Pilox-Federation-Secret`** — legacy shared secret (hash-timed compare), unless disabled by env.
 * Send **at most one** of the two (not both).
 *
 * JWTs minted by the operator proxy include `jti` + `aud`; each `jti` is consumed once in Redis when `MESH_FEDERATION_JWT_REQUIRE_JTI=true`.
 *
 * @returns `undefined` if neither header is present — use normal `authorize()`.
 */
export async function resolveMeshFederationInboundAuth(
  e: Pick<
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
  >,
  minimumRole: Role,
  headers: { jwt: string | null; secret: string | null },
  ip: string
): Promise<
  | undefined
  | { authorized: false; response: NextResponse }
  | MeshFederationJsonRpcAuthOk
> {
  const jwt =
    headers.jwt != null && headers.jwt.trim() !== "" ? headers.jwt.trim() : null;
  const secretHeader =
    headers.secret != null && headers.secret.trim() !== ""
      ? headers.secret.trim()
      : null;
  if (jwt === null && secretHeader === null) return undefined;

  if (jwt !== null && secretHeader !== null) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          error: "Bad Request",
          message:
            "Send only one of X-Pilox-Federation-JWT or X-Pilox-Federation-Secret, not both.",
        },
        { status: 400 }
      ),
    };
  }

  if (!e.MESH_FEDERATION_ENABLED) {
    if (jwt !== null || secretHeader !== null) {
      return federationDisabledResponse();
    }
    return undefined;
  }

  const shared = e.MESH_FEDERATION_SHARED_SECRET;

  let ed25519Resolved: Awaited<
    ReturnType<typeof resolveFederationPeers>
  > | null = null;
  if (jwt !== null && e.MESH_FEDERATION_JWT_ALG === "Ed25519") {
    ed25519Resolved = await resolveFederationPeers(e);
  }

  if (
    jwt !== null &&
    !(await federationInboundJwtVerificationReadyAsync(
      e,
      ed25519Resolved ? { resolvedPeers: ed25519Resolved } : undefined
    ))
  ) {
    return federationDisabledResponse();
  }

  if (
    jwt === null &&
    secretHeader !== null &&
    !federationSharedSecretReady(shared)
  ) {
    return federationDisabledResponse();
  }

  if (
    jwt === null &&
    secretHeader !== null &&
    !e.MESH_FEDERATION_INBOUND_ALLOW_LEGACY_SECRET
  ) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          error: "Forbidden",
          message: "This authentication method is not allowed for federation inbound access.",
        },
        { status: 403 }
      ),
    };
  }

  if (!isFederationInboundIpAllowed(ip, e.MESH_FEDERATION_INBOUND_ALLOWLIST)) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          error: "Forbidden",
          message: "Client is not permitted to use federation inbound access.",
        },
        { status: 403 }
      ),
    };
  }

  let jwtVerified: MeshFederationJwtVerifyOk | undefined;

  if (jwt !== null) {
    const jwtOpts = {
      clockSkewLeewaySeconds: e.MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS,
      expectedAudience: federationJwtExpectedAudience(e),
      requireAudience: e.MESH_FEDERATION_JWT_REQUIRE_AUDIENCE,
      requireJti: e.MESH_FEDERATION_JWT_REQUIRE_JTI,
    };
    let v;
    if (e.MESH_FEDERATION_JWT_ALG === "Ed25519") {
      const resolved = ed25519Resolved!;
      const keyBytes = parsePeerEd25519PublicKeysToBytes(
        resolved.ed25519PublicKeysHex
      );
      if (
        !keyBytes ||
        keyBytes.length !== resolved.origins.length ||
        resolved.origins.length === 0
      ) {
        return {
          authorized: false,
          response: NextResponse.json(
            {
              error: "Unauthorized",
              message: "Federation inbound authentication failed.",
            },
            { status: 401 }
          ),
        };
      }
      v = verifyMeshFederationJwtUnified(
        jwt,
        {
          mode: "Ed25519",
          peerOrigins: resolved.origins,
          peerPublicKeys: keyBytes,
        },
        jwtOpts
      );
    } else {
      v = verifyMeshFederationJwtUnified(
        jwt,
        { mode: "HS256", secret: shared! },
        jwtOpts
      );
    }
    if (!v.ok) {
      const message =
        v.reason === "expired" || v.reason === "not_yet_valid"
          ? "Federation JWT is not valid at this time."
          : "Invalid federation JWT.";
      return {
        authorized: false,
        response: NextResponse.json(
          { error: "Unauthorized", message },
          { status: 401 }
        ),
      };
    }

    jwtVerified = v;

    if (v.jti !== null) {
      const once = await consumeFederationJwtJtiOnce(
        v.jti,
        v.exp,
        e.MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS
      );
      if (!once.ok) {
        if (once.reason === "replay") {
          return {
            authorized: false,
            response: NextResponse.json(
              {
                error: "Unauthorized",
                message: "Federation JWT was already used. Request a new token.",
              },
              { status: 401 }
            ),
          };
        }
        return {
          authorized: false,
          response: NextResponse.json(
            {
              error: "Service Unavailable",
              message: "Federation authentication is temporarily unavailable. Retry later.",
            },
            { status: 503 }
          ),
        };
      }
    }
  } else if (!secretMatches(secretHeader!, shared ?? "")) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          error: "Unauthorized",
          message: "Invalid federation credentials.",
        },
        { status: 401 }
      ),
    };
  }

  if (ROLE_HIERARCHY.operator < ROLE_HIERARCHY[minimumRole]) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          error: "Forbidden",
          message: `This instance requires ${minimumRole} for JSON-RPC; federated peers are treated as operator.`,
        },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    session: null,
    user: {
      id: "pilox-federated",
      name: "Federated peer",
      email: null,
    },
    role: "operator",
    ip,
    authSource: "federation",
    federationInboundAuth: jwt !== null ? "jwt" : "legacy_secret",
    federationJwtIss: jwtVerified?.iss ?? null,
    federationJwtAlg: jwt !== null ? e.MESH_FEDERATION_JWT_ALG : null,
  };
}
