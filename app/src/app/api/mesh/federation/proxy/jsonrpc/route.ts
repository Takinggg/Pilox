import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { readJsonBodyLimited } from "@/lib/a2a/jsonrpc-body";
import { authorize } from "@/lib/authorize";
import { env } from "@/lib/env";
import { createModuleLogger } from "@/lib/logger";
import { resolveFederationPeers } from "@/lib/mesh-federation-resolve";
import { federationJwtExpectedAudience } from "@/lib/mesh-federation-jwt-audience";
import { proxyA2AJsonRpcToPeerOrigin } from "@/lib/mesh-federation-proxy-outbound";
import { federationProxyOperatorTokenMatches } from "@/lib/mesh-federation-proxy-operator-token";
import { federationSharedSecretReady } from "@/lib/mesh-federation-secret";
import { federationJwtTransportReadyAsync } from "@/lib/mesh-federation-transport-ready";
import { enforceMeshFederationProxyRateLimit } from "@/lib/mesh-federation-rate-limit";
import { meshTracer } from "@/lib/mesh-otel";
import { withIncomingOtelContext } from "@/lib/otel-request-context";
import { correlationIdFromRequest } from "@/lib/request-utils";
import { context, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";

const proxyLog = createModuleLogger("mesh.federation.proxy.jsonrpc");

export const runtime = "nodejs";

const bodySchema = z.object({
  peerIndex: z.coerce.number().int().min(0),
  rpc: z.any(),
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Operator proxy: forwards JSON-RPC to `MESH_FEDERATION_PEERS[peerIndex]` using
 * `X-Pilox-Federation-JWT` (HS256 or Ed25519 per `MESH_FEDERATION_JWT_ALG`)
 * and optionally `X-Pilox-Federation-Secret` when configured.
 * Optional `MESH_FEDERATION_PROXY_OPERATOR_TOKEN` requires matching `X-Pilox-Federation-Proxy-Operator-Token`.
 */
export async function POST(req: Request) {
  return withIncomingOtelContext(req.headers, () =>
    meshFederationProxyJsonRpcPost(req)
  );
}

async function meshFederationProxyJsonRpcPost(req: Request): Promise<Response> {
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
  if (!e.MESH_FEDERATION_ENABLED) {
    return NextResponse.json(
      {
        error: "Service Unavailable",
        message: "Mesh federation is disabled (MESH_FEDERATION_ENABLED=false).",
      },
      { status: 503 }
    );
  }
  if (!(await federationJwtTransportReadyAsync(e))) {
    return NextResponse.json(
      {
        error: "Service Unavailable",
        message: "Mesh federation proxy is not available on this instance.",
      },
      { status: 503 }
    );
  }

  const auth = await authorize("operator");
  if (!auth.authorized) return auth.response;

  const proxyOpTok = e.MESH_FEDERATION_PROXY_OPERATOR_TOKEN?.trim();
  if (
    proxyOpTok &&
    !federationProxyOperatorTokenMatches(
      req.headers.get("x-pilox-federation-proxy-operator-token"),
      proxyOpTok
    )
  ) {
    return NextResponse.json(
      {
        error: "Forbidden",
        message: "Missing or invalid federation proxy operator token.",
      },
      { status: 403 }
    );
  }

  const proxyRl = await enforceMeshFederationProxyRateLimit(
    String(auth.user.id ?? auth.ip),
    e
  );
  if (proxyRl) return proxyRl;

  const rawParsed = await readJsonBodyLimited(req, e.A2A_JSONRPC_MAX_BODY_BYTES);
  if (!rawParsed.ok) {
    return NextResponse.json(
      {
        error: rawParsed.status === 413 ? "Payload Too Large" : "Bad Request",
        message:
          rawParsed.status === 413
            ? "JSON body exceeds configured maximum size."
            : "Invalid JSON body (peerIndex, rpc).",
      },
      { status: rawParsed.status }
    );
  }
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(rawParsed.value);
  } catch {
    return NextResponse.json(
      { error: "Bad Request", message: "Invalid JSON body (peerIndex, rpc)." },
      { status: 400 }
    );
  }

  const origins = (await resolveFederationPeers(e)).origins;
  if (parsed.peerIndex >= origins.length) {
    return NextResponse.json(
      {
        error: "Bad Request",
        message: `peerIndex out of range (0..${Math.max(0, origins.length - 1)}).`,
      },
      { status: 400 }
    );
  }

  const origin = origins[parsed.peerIndex]!;
  const bodyUtf8 =
    typeof parsed.rpc === "string"
      ? parsed.rpc
      : JSON.stringify(parsed.rpc);

  let peerHostname = "";
  try {
    peerHostname = new URL(origin).hostname;
  } catch {
    peerHostname = "";
  }

  const sendSharedSecret =
    e.MESH_FEDERATION_PROXY_SEND_SECRET &&
    federationSharedSecretReady(e.MESH_FEDERATION_SHARED_SECRET);

  const tracer = meshTracer();
  const span = tracer.startSpan("mesh.federation.proxy.jsonrpc", {
    kind: SpanKind.SERVER,
    attributes: {
      "mesh.federation.peer_index": parsed.peerIndex,
      ...(peerHostname ? { "server.address": peerHostname } : {}),
    },
  });

  return await context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const upstream = await proxyA2AJsonRpcToPeerOrigin(origin, bodyUtf8, {
        jwtAlg: e.MESH_FEDERATION_JWT_ALG,
        sharedSecret: e.MESH_FEDERATION_SHARED_SECRET ?? "",
        ed25519SeedHex: e.MESH_FEDERATION_ED25519_SEED_HEX,
        issuerOrigin: federationJwtExpectedAudience(e),
        jwtTtlSeconds: e.MESH_FEDERATION_JWT_TTL_SECONDS,
        sendSharedSecret,
        timeoutMs: e.MESH_FEDERATION_PROXY_TIMEOUT_MS,
        forwardRequest: req,
        peerIndex: parsed.peerIndex,
      });

      span.setAttribute("http.status_code", upstream.status);
      if (upstream.status >= 500) {
        span.setStatus({ code: SpanStatusCode.ERROR });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }

      const uid = auth.user.id;
      const correlationId = correlationIdFromRequest(req);
      void db
        .insert(auditLogs)
        .values({
          ...(UUID_RE.test(String(uid)) ? { userId: uid } : {}),
          action: "mesh.federation.proxy_jsonrpc",
          resource: "federation_peer",
          resourceId: origin,
          details: {
            peerIndex: parsed.peerIndex,
            peerHostname: new URL(origin).hostname,
            upstreamStatus: upstream.status,
            correlationId,
          },
          ipAddress: auth.ip,
        })
        .catch((err) => {
          proxyLog.error("mesh.federation.proxy_jsonrpc audit log insert failed", {
            error: err instanceof Error ? err.message : String(err),
            peerIndex: parsed.peerIndex,
            correlationId,
          });
        });

      const ct = upstream.headers.get("content-type") ?? "application/json";
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type": ct,
          ...(correlationId ? { "X-Correlation-Id": correlationId } : {}),
        },
      });
    } catch (err) {
      span.recordException(
        err instanceof Error ? err : new Error(String(err))
      );
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}
