import type { JSONRPCErrorResponse } from "@pilox/a2a-sdk";
import { A2AError } from "@pilox/a2a-sdk/server";
import {
  rateLimitHeaders,
  type RateLimitResult,
} from "@/lib/rate-limit";

/** Pilox JSON-RPC extension: rate-limited public A2A call (HTTP 429). */
export const PUBLIC_A2A_JSONRPC_RATE_LIMIT_CODE = -32_005 as const;

/** Same JSON-RPC error shape as `handleA2AJsonRpcPost` parse failures — without running the full handler. */
export function publicJsonRpcEarlyParseFailureResponse(
  httpStatus: 400 | 413
): Response {
  const err = A2AError.parseError(
    httpStatus === 413
      ? "JSON-RPC body too large."
      : "Invalid JSON payload."
  );
  const errorResponse: JSONRPCErrorResponse = {
    jsonrpc: "2.0",
    id: null,
    error: err.toJSONRPCError(),
  };
  return Response.json(errorResponse, { status: httpStatus });
}

export function publicJsonRpcEarlyInvalidRequestResponse(
  message: string
): Response {
  const err = A2AError.invalidRequest(message);
  const errorResponse: JSONRPCErrorResponse = {
    jsonrpc: "2.0",
    id: null,
    error: err.toJSONRPCError(),
  };
  return Response.json(errorResponse, { status: 400 });
}

/** JSON-RPC body on HTTP 429 — same envelope as other public-tier early responses; keeps rate-limit headers. */
/** Same envelope as failed session auth on this route — public tier must not leak method existence. */
export function publicJsonRpcUnauthorizedResponse(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function publicJsonRpcRateLimitedResponse(
  result: RateLimitResult
): Response {
  const err = new A2AError(
    PUBLIC_A2A_JSONRPC_RATE_LIMIT_CODE,
    "Too many requests.",
    {
      retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
      limit: result.limit,
    }
  );
  const errorResponse: JSONRPCErrorResponse = {
    jsonrpc: "2.0",
    id: null,
    error: err.toJSONRPCError(),
  };
  return Response.json(errorResponse, {
    status: 429,
    headers: rateLimitHeaders(result),
  });
}
