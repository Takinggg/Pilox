import { NextResponse } from "next/server";
import { getPiloxA2AServer } from "@/lib/a2a/server";
import { handleA2AJsonRpcPost } from "@/lib/a2a/jsonrpc-next";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import {
  jsonRpcMethodFromBody,
  publicA2aAllowedMethodSet,
} from "@/lib/a2a/public-jsonrpc-policy";
import {
  enforcePublicA2aJsonRpcRateLimit,
  extractPublicIdentityFromRequest,
  normalizeA2aRateLimitClientIp,
} from "@/lib/a2a/public-jsonrpc-rate-limit";
import { recordPublicPeerReputationEvent } from "@/lib/a2a/public-identity-reputation";
import {
  publicJsonRpcEarlyInvalidRequestResponse,
  publicJsonRpcEarlyParseFailureResponse,
  publicJsonRpcUnauthorizedResponse,
} from "@/lib/a2a/public-jsonrpc-early-response";
import {
  extractPublicApiKeyCandidate,
  matchPublicA2aApiKey,
  parsePublicA2aApiKeyEntries,
} from "@/lib/a2a/public-jsonrpc-api-key";
import { createModuleLogger } from "@/lib/logger";
import { PiloxA2AUser } from "@/lib/a2a/pilox-a2a-user";
import { authorize, type Role } from "@/lib/authorize";
import { env } from "@/lib/env";
import {
  resolveMeshFederationInboundAuth,
  type MeshFederationJsonRpcAuthOk,
} from "@/lib/mesh-federation-inbound-auth";
import { enforceMeshFederationInboundRateLimit } from "@/lib/mesh-federation-rate-limit";
import { auditMeshFederationInboundJsonRpcComplete } from "@/lib/mesh-federation-inbound-audit";
import { a2aJsonRpcEntrypointKind } from "@/lib/a2a/a2a-jsonrpc-entrypoint";
import { correlationIdFromRequest } from "@/lib/request-utils";
import { recordMeshPublicA2aTierDecision } from "@/lib/mesh-otel";
import { enforcePublicReputationBlockIfNeeded } from "@/lib/a2a/public-reputation-block";
import { meshGatewayInboundAuthFailure } from "@/lib/mesh-gateway-inbound-auth";
import { resolveClientIpFromRequest } from "@/lib/client-ip-headers";

const publicTierLog = createModuleLogger("a2a.jsonrpc.public");

/**
 * Shared POST handler for `/api/a2a/jsonrpc` and `/api/a2a/jsonrpc/public` (same auth, policy, and limits).
 */
export async function a2aJsonRpcRoutePost(req: Request): Promise<Response> {
  const entrypoint = a2aJsonRpcEntrypointKind(req);
  const e = env();
  if (!e.A2A_ENABLED) {
    return NextResponse.json(
      {
        error: "Service Unavailable",
        message: "A2A is disabled on this instance (A2A_ENABLED=false).",
      },
      { status: 503 }
    );
  }

  const gwSecret = e.MESH_GATEWAY_INBOUND_SECRET.trim();
  const gwEnforce = e.MESH_GATEWAY_JSONRPC_ENFORCE && gwSecret.length > 0;
  const gwFail = meshGatewayInboundAuthFailure(req, gwSecret, gwEnforce);
  if (gwFail) return gwFail;

  const minRole = e.A2A_JSONRPC_MIN_ROLE as Role;
  const ip = resolveClientIpFromRequest(req, e.PILOX_CLIENT_IP_SOURCE, {
    useMiddlewareSetClientIp: true,
  });
  const clientIpNorm = normalizeA2aRateLimitClientIp(ip);
  const maxBody = e.A2A_JSONRPC_MAX_BODY_BYTES;
  const bodyPeek = await readJsonBodyLimited(req.clone(), maxBody);
  const publicAllowed = publicA2aAllowedMethodSet(
    e.A2A_PUBLIC_JSONRPC_ALLOWED_METHODS
  );
  const peekMethod = bodyPeek.ok
    ? jsonRpcMethodFromBody(bodyPeek.value)
    : "";

  const fedJwt = req.headers.get("x-pilox-federation-jwt");
  const fedSecret = req.headers.get("x-pilox-federation-secret");
  const fedAuth = await resolveMeshFederationInboundAuth(
    e,
    minRole,
    { jwt: fedJwt, secret: fedSecret },
    ip
  );

  type AuthorizeOk = Extract<
    Awaited<ReturnType<typeof authorize>>,
    { authorized: true }
  >;
  type RpcAuth = AuthorizeOk | MeshFederationJsonRpcAuthOk;

  function isFederationMeshAuth(a: RpcAuth): a is MeshFederationJsonRpcAuthOk {
    return a.authSource === "federation";
  }

  let auth: RpcAuth;
  if (fedAuth !== undefined) {
    if (!fedAuth.authorized) return fedAuth.response;
    auth = fedAuth;
  } else {
    const a = await authorize(minRole);
    if (a.authorized) {
      auth = a;
    } else if (
      e.A2A_PUBLIC_JSONRPC_ENABLED &&
      (!bodyPeek.ok ||
        peekMethod === "" ||
        publicAllowed.has(peekMethod))
    ) {
      const configuredApiKeyEntries = parsePublicA2aApiKeyEntries(
        e.A2A_PUBLIC_JSONRPC_API_KEYS ?? ""
      );
      const rawApiKey =
        configuredApiKeyEntries.length > 0
          ? extractPublicApiKeyCandidate(req)
          : null;
      const apiKeyMatch =
        rawApiKey && configuredApiKeyEntries.length > 0
          ? matchPublicA2aApiKey(rawApiKey, configuredApiKeyEntries)
          : null;
      const apiKeyHash = apiKeyMatch?.hash ?? null;

      /** Parse / missing-method paths stay JSON-RPC 4xx — do not mask as 401 for API key. */
      const apiKeyGateActive = bodyPeek.ok && peekMethod !== "";

      if (
        apiKeyGateActive &&
        configuredApiKeyEntries.length > 0 &&
        rawApiKey &&
        !apiKeyHash
      ) {
        recordMeshPublicA2aTierDecision("unauthorized_invalid_key");
        return publicJsonRpcUnauthorizedResponse();
      }
      if (apiKeyGateActive && e.A2A_PUBLIC_JSONRPC_REQUIRE_API_KEY && !apiKeyHash) {
        recordMeshPublicA2aTierDecision("unauthorized_required_key");
        return publicJsonRpcUnauthorizedResponse();
      }

      const idHeader = e.A2A_PUBLIC_JSONRPC_IDENTITY_HEADER?.trim() ?? "";
      const identity =
        !apiKeyHash && idHeader !== ""
          ? extractPublicIdentityFromRequest(
              req,
              idHeader,
              e.A2A_PUBLIC_JSONRPC_IDENTITY_MAX_LEN
            )
          : null;
      const identityHash = identity?.hash ?? null;

      const blocked = await enforcePublicA2aJsonRpcRateLimit(clientIpNorm, e, {
        logContext: { entrypoint, clientIp: clientIpNorm },
        identityHash,
        apiKeyHash,
      });
      if (blocked) return blocked;

      const repHashForBlock = apiKeyHash ?? identityHash;
      const repBlocked = await enforcePublicReputationBlockIfNeeded(e, repHashForBlock);
      if (repBlocked) {
        recordMeshPublicA2aTierDecision("reputation_blocked");
        return repBlocked;
      }

      if (!bodyPeek.ok) {
        recordMeshPublicA2aTierDecision("parse_rejected");
        publicTierLog.info("mesh.a2a.public_tier.parse_rejected", {
          entrypoint,
          httpStatus: bodyPeek.status,
          clientIp: clientIpNorm,
        });
        return publicJsonRpcEarlyParseFailureResponse(bodyPeek.status);
      }
      if (peekMethod === "") {
        recordMeshPublicA2aTierDecision("invalid_method");
        publicTierLog.info("mesh.a2a.public_tier.invalid_request", {
          entrypoint,
          reason: "missing_or_invalid_method",
          clientIp: clientIpNorm,
        });
        return publicJsonRpcEarlyInvalidRequestResponse(
          "JSON-RPC request must include a valid string method."
        );
      }
      if (
        apiKeyGateActive &&
        apiKeyHash &&
        apiKeyMatch != null &&
        apiKeyMatch.scopes !== null &&
        !new Set(apiKeyMatch.scopes).has(peekMethod)
      ) {
        recordMeshPublicA2aTierDecision("unauthorized_scope");
        return publicJsonRpcUnauthorizedResponse();
      }
      const repHash = apiKeyHash ?? identityHash;
      publicTierLog.info("mesh.a2a.public_tier.invoke", {
        entrypoint,
        method: peekMethod,
        clientIp: clientIpNorm,
        ...(apiKeyHash
          ? { apiKeyHashPrefix: apiKeyHash.slice(0, 8) }
          : identityHash
            ? { identityKeyHashPrefix: identityHash.slice(0, 8) }
            : {}),
      });
      const user = new PiloxA2AUser(true, "pilox-public-a2a");
      const server = getPiloxA2AServer();
      const rpcRes = await handleA2AJsonRpcPost(server.handler, req, user, maxBody, {
        redisCallerKeySuffix: apiKeyHash
          ? `public-a2a:${clientIpNorm}:k:${apiKeyHash.slice(0, 16)}`
          : identityHash
            ? `public-a2a:${clientIpNorm}:id:${identityHash.slice(0, 16)}`
            : `public-a2a:${clientIpNorm}`,
        entrypoint,
      });
      if (repHash) {
        void recordPublicPeerReputationEvent(
          e,
          repHash,
          rpcRes.status === 200
            ? "ok"
            : rpcRes.status === 429
              ? "rate_limited"
              : "rpc_error"
        );
      }
      return rpcRes;
    } else {
      return a.response;
    }
  }

  if (isFederationMeshAuth(auth)) {
    const blocked = await enforceMeshFederationInboundRateLimit(
      clientIpNorm,
      e
    );
    if (blocked) return blocked;
  }

  const u = auth.user as { id?: string; email?: string | null } | undefined;
  const label = isFederationMeshAuth(auth)
    ? "pilox-federated"
    : auth.authSource === "internal"
      ? "pilox-internal"
      : u?.id
        ? String(u.id)
        : u?.email
          ? String(u.email)
          : "pilox-user";

  const user = new PiloxA2AUser(true, label);
  const server = getPiloxA2AServer();
  const rpcRes = await handleA2AJsonRpcPost(
    server.handler,
    req,
    user,
    maxBody,
    isFederationMeshAuth(auth)
      ? { redisCallerKeySuffix: `fed-ip:${clientIpNorm}`, entrypoint }
      : undefined
  );
  if (isFederationMeshAuth(auth)) {
    auditMeshFederationInboundJsonRpcComplete({
      ip: clientIpNorm,
      jsonRpcMethod: peekMethod || "(unknown)",
      responseStatus: rpcRes.status,
      correlationId: correlationIdFromRequest(req),
      federationInboundAuth: auth.federationInboundAuth,
      federationJwtIss: auth.federationJwtIss,
      federationJwtAlg: auth.federationJwtAlg,
      entrypoint,
    });
  }
  return rpcRes;
}
