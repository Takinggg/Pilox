import { MESH_FEDERATION_SECRET_HEADER } from "@/lib/mesh-federation-inbound-auth";
import {
  mintMeshFederationJwt,
  mintMeshFederationJwtEd25519,
  MESH_FEDERATION_JWT_HEADER,
} from "@/lib/mesh-federation-jwt";
import { meshTracer } from "@/lib/mesh-otel";
import { createModuleLogger } from "@/lib/logger";
import {
  context,
  defaultTextMapSetter,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";

const log = createModuleLogger("mesh.federation.proxy-outbound");

/** Default outbound fetch timeout (was 5 minutes — too easy to tie up workers). */
export const DEFAULT_MESH_FEDERATION_PROXY_TIMEOUT_MS = 30_000;

/**
 * POST JSON-RPC body to a peer's `/api/a2a/jsonrpc` with a short-lived federation JWT
 * (and optionally the legacy shared-secret header).
 * Origins must come from env parsing only (caller-supplied URL SSRF-safe at call site).
 */
export async function proxyA2AJsonRpcToPeerOrigin(
  origin: string,
  rpcBodyUtf8: string,
  opts: {
    jwtAlg: "HS256" | "Ed25519";
    sharedSecret: string;
    ed25519SeedHex: string;
    /** This instance's public origin (`aud` on peer / `iss` when minting Ed25519). */
    issuerOrigin: string;
    jwtTtlSeconds: number;
    /** When false, only `X-Pilox-Federation-JWT` is sent (peers must accept JWT-only). */
    sendSharedSecret: boolean;
    timeoutMs?: number;
    forwardRequest?: Request;
    /** Optional peer index for OTel attributes (operator proxy). */
    peerIndex?: number;
  }
): Promise<Response> {
  const jwt =
    opts.jwtAlg === "Ed25519"
      ? mintMeshFederationJwtEd25519(
          opts.ed25519SeedHex,
          opts.jwtTtlSeconds,
          origin,
          opts.issuerOrigin
        )
      : mintMeshFederationJwt(
          opts.sharedSecret,
          opts.jwtTtlSeconds,
          origin
        );
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    [MESH_FEDERATION_JWT_HEADER]: jwt,
    "User-Agent": "Pilox-Mesh-Federation/2.5",
  };
  if (opts.sendSharedSecret && opts.sharedSecret.length >= 32) {
    headers[MESH_FEDERATION_SECRET_HEADER] = opts.sharedSecret;
    try {
      const u = new URL(origin);
      if (u.protocol === "http:") {
        log.warn(
          "Federation proxy sends shared secret in headers over cleartext HTTP — prefer https:// peer origins or keep only JWT on the wire.",
          { hostname: u.hostname }
        );
      }
    } catch {
      /* ignore */
    }
  }

  const req = opts.forwardRequest;
  if (req) {
    const rid = req.headers.get("x-request-id");
    const cid = req.headers.get("x-correlation-id");
    if (rid) headers["X-Request-Id"] = rid;
    if (cid) headers["X-Correlation-Id"] = cid;
  }

  const url = `${origin}/api/a2a/jsonrpc`;
  let serverAddress = "";
  try {
    serverAddress = new URL(origin).hostname;
  } catch {
    /* leave empty */
  }

  const tracer = meshTracer();
  const clientSpan = tracer.startSpan("mesh.federation.proxy.peer_fetch", {
    kind: SpanKind.CLIENT,
    attributes: {
      "http.request.method": "POST",
      "server.address": serverAddress,
      "url.full": url,
      ...(opts.peerIndex !== undefined
        ? { "mesh.federation.peer_index": opts.peerIndex }
        : {}),
    },
  });

  return await context.with(trace.setSpan(context.active(), clientSpan), async () => {
    propagation.inject(context.active(), headers, defaultTextMapSetter);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: rpcBodyUtf8,
        redirect: "manual",
        signal: AbortSignal.timeout(
          opts.timeoutMs ?? DEFAULT_MESH_FEDERATION_PROXY_TIMEOUT_MS
        ),
      });
      clientSpan.setAttribute("http.response.status_code", res.status);
      if (res.status >= 500) {
        clientSpan.setStatus({ code: SpanStatusCode.ERROR });
      } else {
        clientSpan.setStatus({ code: SpanStatusCode.OK });
      }
      return res;
    } catch (err) {
      clientSpan.recordException(
        err instanceof Error ? err : new Error(String(err))
      );
      clientSpan.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      clientSpan.end();
    }
  });
}
