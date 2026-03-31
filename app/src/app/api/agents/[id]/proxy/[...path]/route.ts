import { authorize } from "@/lib/authorize";
import { ErrorCode, errorResponse } from "@/lib/errors";
import { findOwnedAgent } from "@/lib/agent-ownership";
import { resolveAgentBaseUrl } from "@/lib/agent-port";
import { isAllowedAgentIP } from "@/lib/agent-network-guard";
import { withHttpServerSpan } from "@/lib/otel-http-route";

/** Headers stripped from proxied requests to prevent information leakage. */
const STRIP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "authorization",
  "cookie",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  "x-client-ip",
  "cf-connecting-ip",
  "true-client-ip",
  "x-api-key",
  "x-auth-token",
  "proxy-authorization",
]);

/** Headers stripped from upstream responses. */
const STRIP_RESPONSE_HEADERS = new Set([
  "transfer-encoding",
  "connection",
  "set-cookie",
]);

async function proxyHandler(
  req: Request,
  { params }: { params: Promise<{ id: string; path: string[] }> },
) {
  return withHttpServerSpan(req, `${req.method} /api/agents/[id]/proxy/[...path]`, async () => {
    const authResult = await authorize("operator");
    if (!authResult.authorized) return authResult.response;

    const { id, path } = await params;
    const agent = await findOwnedAgent(id, authResult.user.id, authResult.role);

    if (!agent) return errorResponse(ErrorCode.NOT_FOUND, "Agent not found", 404);
    if (!agent.instanceId || !agent.instanceIp) {
      return errorResponse(ErrorCode.INVALID_INPUT, "Agent has no running instance", 400);
    }
    if (!["running", "ready"].includes(agent.status)) {
      return errorResponse(ErrorCode.INVALID_INPUT, `Agent is ${agent.status}, not running`, 400);
    }

    // SSRF guard: only allow IPs within Docker internal network ranges
    if (!isAllowedAgentIP(agent.instanceIp)) {
      return errorResponse(
        ErrorCode.INVALID_INPUT,
        "Agent IP address is not in an allowed network range",
        403,
      );
    }

    const baseUrl = resolveAgentBaseUrl(agent);
    const targetPath = "/" + path.join("/");
    const url = new URL(req.url);
    const targetUrl = `${baseUrl}${targetPath}${url.search}`;

    try {
      const headers = new Headers();
      for (const [key, value] of req.headers.entries()) {
        if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) {
          headers.set(key, value);
        }
      }

      const fetchOpts: RequestInit = {
        method: req.method,
        headers,
        signal: AbortSignal.timeout(120_000),
      };

      if (req.body && !["GET", "HEAD"].includes(req.method)) {
        fetchOpts.body = req.body;
        // @ts-expect-error -- required for streaming body forwarding in Node
        fetchOpts.duplex = "half";
      }

      const upstream = await fetch(targetUrl, fetchOpts);

      const responseHeaders = new Headers();
      for (const [key, value] of upstream.headers.entries()) {
        if (!STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
          responseHeaders.set(key, value);
        }
      }

      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch {
      return errorResponse(
        ErrorCode.SERVICE_UNAVAILABLE,
        "Failed to reach agent instance",
        502,
      );
    }
  });
}

export const GET = proxyHandler;
export const POST = proxyHandler;
export const PUT = proxyHandler;
export const DELETE = proxyHandler;
export const PATCH = proxyHandler;
