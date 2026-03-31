import {
  metrics,
  trace,
  SpanStatusCode,
  type Counter,
  type Histogram,
  type Span,
} from "@opentelemetry/api";

const TRACER_NAME = "pilox.mesh";
const METER_NAME = "pilox.mesh";
const METER_VERSION = "1.0.0";

/** Lazy so instruments bind to the real MeterProvider after `startOpenTelemetry()`. */
let instruments:
  | {
      rpcDurationMs: Histogram;
      rateLimitBlocked: Counter;
      rateLimitWindowUtilization: Histogram;
      publicTierDecisions: Counter;
      publicReputationEvents: Counter;
    }
  | undefined;

function meshInstruments() {
  if (!instruments) {
    const meter = metrics.getMeter(METER_NAME, METER_VERSION);
    instruments = {
      rpcDurationMs: meter.createHistogram("pilox.mesh.a2a.rpc.duration_ms", {
        unit: "ms",
        description:
          "Wall time for A2A JSON-RPC handling (parse + handler; stream path ends at response creation).",
      }),
      rateLimitBlocked: meter.createCounter("pilox.mesh.rate_limit.blocked_total", {
        description: "Redis sliding-window rate limit denials by tier (key prefix).",
      }),
      rateLimitWindowUtilization: meter.createHistogram(
        "pilox.mesh.rate_limit.window_utilization_ratio",
        {
          description:
            "Approximate fill level of the active window after each check (0–1). High values indicate saturation.",
          unit: "1",
        }
      ),
      publicTierDecisions: meter.createCounter(
        "pilox.mesh.a2a.public_tier.decisions_total",
        {
          description:
            "Public JSON-RPC tier outcomes before the shared handler (401, parse/method 4xx). Attribute mesh.a2a.public_tier.decision.",
        }
      ),
      publicReputationEvents: meter.createCounter(
        "pilox.mesh.a2a.public_reputation.events_total",
        {
          description:
            "Mirrors successful Redis incr for pilox:mesh:pub_rep:* when reputation tracking is on. Attribute mesh.a2a.public_reputation.kind.",
        }
      ),
    };
  }
  return instruments;
}

export function meshTracer() {
  return trace.getTracer(TRACER_NAME, METER_VERSION);
}

/** Early exits in `a2aJsonRpcRoutePost` public branch (no `recordMeshA2aRpcComplete`). */
export type MeshPublicA2aTierDecision =
  | "unauthorized_invalid_key"
  | "unauthorized_required_key"
  | "unauthorized_scope"
  | "parse_rejected"
  | "invalid_method"
  | "reputation_blocked";

export function recordMeshPublicA2aTierDecision(
  decision: MeshPublicA2aTierDecision
): void {
  meshInstruments().publicTierDecisions.add(1, {
    "mesh.a2a.public_tier.decision": decision,
  });
}

/** After a successful Redis `INCR` for `pilox:mesh:pub_rep:*`. */
export type MeshPublicReputationKind =
  | "ok"
  | "rate_limited"
  | "rpc_error";

export function recordMeshPublicReputationRedisSuccess(
  kind: MeshPublicReputationKind
): void {
  meshInstruments().publicReputationEvents.add(1, {
    "mesh.a2a.public_reputation.kind": kind,
  });
}

function rateLimitTierFromKeyPrefix(keyPrefix: string): string {
  switch (keyPrefix) {
    case "pilox:rl:public_a2a":
      return "public_a2a";
    case "pilox:rl:public_a2a_id":
      return "public_a2a_identity";
    case "pilox:rl:public_a2a_apikey":
      return "public_a2a_api_key";
    case "pilox:rl:federation":
      return "federation";
    case "pilox:rl:a2a":
      return "a2a_jsonrpc";
    default:
      return "other";
  }
}

/**
 * Called from `checkRateLimitWithConfig` for every Redis sliding-window check
 * (public A2A, federation, generic A2A middleware, etc.).
 */
export function recordMeshRateLimitObservation(
  keyPrefix: string,
  result: { allowed: boolean; remaining: number; limit: number }
): void {
  const tier = rateLimitTierFromKeyPrefix(keyPrefix);
  const { rateLimitBlocked, rateLimitWindowUtilization } = meshInstruments();
  const limit = result.limit;
  const util =
    limit > 0
      ? Math.min(1, Math.max(0, (limit - result.remaining) / limit))
      : 0;
  rateLimitWindowUtilization.record(util, { "mesh.rate_limit.tier": tier });
  if (!result.allowed) {
    rateLimitBlocked.add(1, { "mesh.rate_limit.tier": tier });
  }
}

export type MeshA2aRpcOtelOutcome =
  | "ok"
  | "jsonrpc_error"
  | "exception"
  | "invalid_json";

export function recordMeshA2aRpcComplete(params: {
  durationMs: number;
  outcome: MeshA2aRpcOtelOutcome;
  method: string;
  entrypoint?: string;
  streaming?: boolean;
  httpStatus?: number;
}): void {
  const attrs: Record<string, string | number | boolean> = {
    "mesh.a2a.outcome": params.outcome,
    "rpc.method": params.method || "(parse)",
  };
  if (params.entrypoint !== undefined) attrs["pilox.entrypoint"] = params.entrypoint;
  if (params.streaming === true) attrs["mesh.a2a.streaming"] = true;
  if (params.httpStatus !== undefined) attrs["http.status_code"] = params.httpStatus;

  meshInstruments().rpcDurationMs.record(params.durationMs, attrs);
}

export function endMeshA2aJsonRpcSpan(
  span: Span,
  params: {
    outcome: MeshA2aRpcOtelOutcome;
    httpStatus?: number;
    method?: string;
  }
): void {
  if (params.method) span.setAttribute("rpc.method", params.method);
  if (params.httpStatus !== undefined) {
    span.setAttribute("http.status_code", params.httpStatus);
  }
  span.setAttribute("mesh.a2a.outcome", params.outcome);
  if (
    params.outcome === "exception" ||
    params.outcome === "invalid_json" ||
    (params.httpStatus !== undefined && params.httpStatus >= 500)
  ) {
    span.setStatus({ code: SpanStatusCode.ERROR });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
  span.end();
}
