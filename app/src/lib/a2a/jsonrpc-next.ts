import type {
  JSONRPCErrorResponse,
  JSONRPCResponse,
  JSONRPCSuccessResponse,
} from "@pilox/a2a-sdk";
import {
  HTTP_EXTENSION_HEADER,
  Extensions,
} from "@pilox/a2a-sdk";
import {
  JsonRpcTransportHandler,
  ServerCallContext,
  A2AError,
  type A2ARequestHandler,
  type User,
} from "@pilox/a2a-sdk/server";
import {
  a2aRedisRateLimitAls,
  a2aRateLimitCallerKeyFromUserName,
} from "@/lib/a2a/a2a-rate-limit-context";
import {
  A2A_JSONRPC_DEFAULT_MAX_BODY_BYTES,
  readJsonBodyLimited,
} from "@/lib/a2a/jsonrpc-body";
import { createModuleLogger } from "@/lib/logger";
import { a2aCallerLogFields } from "@/lib/a2a/a2a-log-privacy";
import type { A2aJsonRpcEntrypointKind } from "@/lib/a2a/a2a-jsonrpc-entrypoint";
import {
  endMeshA2aJsonRpcSpan,
  meshTracer,
  recordMeshA2aRpcComplete,
} from "@/lib/mesh-otel";
import { extractOtelParentContext } from "@/lib/otel-request-context";
import { context, SpanKind } from "@opentelemetry/api";

const log = createModuleLogger("a2a.jsonrpc");

function meshA2aRpcLogExtras(): { entrypoint?: A2aJsonRpcEntrypointKind } {
  const ep = a2aRedisRateLimitAls.getStore()?.entrypoint;
  return ep !== undefined ? { entrypoint: ep } : {};
}

const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

function formatSSEEvent(event: unknown): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function formatSSEErrorEvent(error: unknown): string {
  return `event: error\ndata: ${JSON.stringify(error)}\n\n`;
}

type RpcCompleteOutcome =
  | "ok"
  | "jsonrpc_error"
  | "exception"
  | "invalid_json";

export type HandleA2AJsonRpcPostOptions = {
  /** Override Redis rate-limit key segment (after `caller:`). Use for federation (per-IP) etc. */
  redisCallerKeySuffix?: string;
  /** Physical mount for `mesh.a2a.rpc.*` (public tier or federated ingress). */
  entrypoint?: A2aJsonRpcEntrypointKind;
};

/** Bridges A2A JSON-RPC to Web Fetch API (Next.js Route Handler). */
export async function handleA2AJsonRpcPost(
  requestHandler: A2ARequestHandler,
  req: Request,
  user: User,
  maxBodyBytes: number = A2A_JSONRPC_DEFAULT_MAX_BODY_BYTES,
  opts?: HandleA2AJsonRpcPostOptions
): Promise<Response> {
  const suffix = opts?.redisCallerKeySuffix?.trim().slice(0, 256);
  const callerKey = suffix
    ? `caller:${suffix}`
    : a2aRateLimitCallerKeyFromUserName(user.userName);
  const entrypoint = opts?.entrypoint;
  const parentOtelCtx = extractOtelParentContext(req.headers);
  return context.with(parentOtelCtx, () =>
    a2aRedisRateLimitAls.run(
      entrypoint !== undefined ? { callerKey, entrypoint } : { callerKey },
      async () => handleA2AJsonRpcPostInner(requestHandler, req, user, maxBodyBytes)
    )
  );
}

async function handleA2AJsonRpcPostInner(
  requestHandler: A2ARequestHandler,
  req: Request,
  user: User,
  maxBodyBytes: number
): Promise<Response> {
  const wallT0 = Date.now();
  const caller = a2aCallerLogFields(user.userName);
  const tracer = meshTracer();
  const span = tracer.startSpan("mesh.a2a.jsonrpc", { kind: SpanKind.SERVER });
  const ep = a2aRedisRateLimitAls.getStore()?.entrypoint;
  if (ep !== undefined) span.setAttribute("pilox.entrypoint", ep);

  const parsed = await readJsonBodyLimited(req, maxBodyBytes);
  if (!parsed.ok) {
    const durationMs = Date.now() - wallT0;
    log.info("mesh.a2a.rpc.complete", {
      ...caller,
      ...meshA2aRpcLogExtras(),
      method: "(parse)",
      jsonRpcId: null,
      durationMs,
      outcome: "invalid_json" satisfies RpcCompleteOutcome,
    });
    recordMeshA2aRpcComplete({
      durationMs,
      outcome: "invalid_json",
      method: "(parse)",
      entrypoint: ep,
      httpStatus: parsed.status,
    });
    endMeshA2aJsonRpcSpan(span, {
      outcome: "invalid_json",
      httpStatus: parsed.status,
      method: "(parse)",
    });
    const err = A2AError.parseError(
      parsed.status === 413
        ? "JSON-RPC body too large."
        : "Invalid JSON payload."
    );
    const errorResponse: JSONRPCErrorResponse = {
      jsonrpc: "2.0",
      id: null,
      error: err.toJSONRPCError(),
    };
    return Response.json(errorResponse, { status: parsed.status });
  }
  const body = parsed.value;

  const transport = new JsonRpcTransportHandler(requestHandler);
  const extHeader = req.headers.get(HTTP_EXTENSION_HEADER) ?? undefined;
  const context = new ServerCallContext(
    Extensions.parseServiceParameter(extHeader),
    user
  );

  const method =
    typeof body === "object" && body !== null && "method" in body
      ? String((body as { method?: unknown }).method ?? "")
      : "";
  const rpcId =
    typeof body === "object" && body !== null && "id" in body
      ? (body as { id: unknown }).id
      : null;

  log.info("mesh.a2a.rpc.request", {
    method: method || "(parse)",
    jsonRpcId: rpcId,
    ...caller,
    ...meshA2aRpcLogExtras(),
  });

  span.setAttribute("rpc.method", method || "(parse)");

  const handleT0 = Date.now();

  try {
    const rpcResponseOrStream = await transport.handle(body, context);

    const headers = new Headers();
    if (context.activatedExtensions?.length) {
      headers.set(HTTP_EXTENSION_HEADER, context.activatedExtensions.join(","));
    }

    if (typeof (rpcResponseOrStream as AsyncGenerator)?.[Symbol.asyncIterator] === "function") {
      const stream = rpcResponseOrStream as AsyncGenerator<
        JSONRPCSuccessResponse,
        void,
        undefined
      >;

      for (const [k, v] of Object.entries(SSE_HEADERS)) {
        headers.set(k, v);
      }

      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          const streamT0 = Date.now();
          log.info("mesh.a2a.rpc.stream_start", {
            method: method || "(parse)",
            jsonRpcId: rpcId,
            ...caller,
            ...meshA2aRpcLogExtras(),
          });
          let outcome: "ok" | "exception" = "ok";
          try {
            for await (const event of stream) {
              controller.enqueue(encoder.encode(formatSSEEvent(event)));
            }
          } catch (streamError) {
            outcome = "exception";
            log.error("A2A SSE stream error", {
              ...caller,
              ...meshA2aRpcLogExtras(),
              error: streamError instanceof Error ? streamError.message : String(streamError),
            });
            const a2aError =
              streamError instanceof A2AError
                ? streamError
                : A2AError.internalError(
                    streamError instanceof Error
                      ? streamError.message
                      : "Streaming error."
                  );
            const reqId = (body as { id?: string | number | null }).id;
            const errorResponse: JSONRPCErrorResponse = {
              jsonrpc: "2.0",
              id: reqId ?? null,
              error: a2aError.toJSONRPCError(),
            };
            controller.enqueue(encoder.encode(formatSSEErrorEvent(errorResponse)));
          } finally {
            const streamWallMs = Date.now() - wallT0;
            log.info("mesh.a2a.rpc.stream_end", {
              method: method || "(parse)",
              jsonRpcId: rpcId,
              ...caller,
              ...meshA2aRpcLogExtras(),
              durationMs: Date.now() - streamT0,
              outcome,
            });
            recordMeshA2aRpcComplete({
              durationMs: streamWallMs,
              outcome: outcome === "exception" ? "exception" : "ok",
              method: method || "(parse)",
              entrypoint: ep,
              streaming: true,
              httpStatus: 200,
            });
            endMeshA2aJsonRpcSpan(span, {
              outcome: outcome === "exception" ? "exception" : "ok",
              httpStatus: 200,
              method: method || "(parse)",
            });
            controller.close();
          }
        },
      });

      return new Response(readable, { status: 200, headers });
    }

    const rpcResponse = rpcResponseOrStream as JSONRPCResponse;
    const outcome: RpcCompleteOutcome =
      "error" in rpcResponse && rpcResponse.error != null
        ? "jsonrpc_error"
        : "ok";
    const syncDurationMs = Date.now() - handleT0;
    log.info("mesh.a2a.rpc.complete", {
      method: method || "(parse)",
      jsonRpcId: rpcId,
      ...caller,
      ...meshA2aRpcLogExtras(),
      durationMs: syncDurationMs,
      outcome,
    });
    recordMeshA2aRpcComplete({
      durationMs: syncDurationMs,
      outcome,
      method: method || "(parse)",
      entrypoint: ep,
      httpStatus: 200,
    });
    endMeshA2aJsonRpcSpan(span, {
      outcome,
      httpStatus: 200,
      method: method || "(parse)",
    });
    return Response.json(rpcResponse, { status: 200, headers });
  } catch (error) {
    const exDurationMs = Date.now() - handleT0;
    log.info("mesh.a2a.rpc.complete", {
      method: method || "(parse)",
      jsonRpcId: rpcId,
      ...caller,
      ...meshA2aRpcLogExtras(),
      durationMs: exDurationMs,
      outcome: "exception" satisfies RpcCompleteOutcome,
    });
    log.error("A2A JSON-RPC handler error", {
      ...caller,
      ...meshA2aRpcLogExtras(),
      error: error instanceof Error ? error.message : String(error),
    });
    recordMeshA2aRpcComplete({
      durationMs: exDurationMs,
      outcome: "exception",
      method: method || "(parse)",
      entrypoint: ep,
      httpStatus: 500,
    });
    endMeshA2aJsonRpcSpan(span, {
      outcome: "exception",
      httpStatus: 500,
      method: method || "(parse)",
    });
    const a2aError =
      error instanceof A2AError
        ? error
        : A2AError.internalError("General processing error.");
    const reqId = (body as { id?: string | number | null }).id;
    const errorResponse: JSONRPCErrorResponse = {
      jsonrpc: "2.0",
      id: reqId ?? null,
      error: a2aError.toJSONRPCError(),
    };
    return Response.json(errorResponse, { status: 500 });
  }
}
