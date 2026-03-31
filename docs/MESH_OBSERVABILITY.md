# Mesh — OpenTelemetry observability (V3)

Hive already emits **structured logs** (`mesh.a2a.*`, `mesh.federation.*`). This document describes the optional **OTel** layer: **traces** and **metrics** to an OTLP collector (HTTP), for production diagnostics (latencies, 429s, Redis window saturation).

## Activation

Environment variables (see also `app/.env.example`):

| Variable | Role |
|----------|------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector base URL (e.g., `http://alloy:4318`). **Without this variable, the SDK is not loaded.** |
| `OTEL_SERVICE_NAME` | Service name (default: `hive`) |
| `OTEL_METRIC_EXPORT_INTERVAL_MS` | Metric export period (default: `10000`) |
| `OTEL_SDK_DISABLED` | `true` to force disable |

The SDK is started from `src/instrumentation.ts` (Node runtime only) and shut down gracefully on shutdown (`SIGTERM` / `SIGINT`).

## Traces

| Span | When |
|------|------|
| `mesh.a2a.jsonrpc` | Processing `handleA2AJsonRpcPost` (body parsing + JSON-RPC / SSE handler) |
| `mesh.federation.proxy.jsonrpc` | `POST /api/mesh/federation/proxy/jsonrpc` — operator call to a peer (after auth / rate limit / body validation) |
| `mesh.federation.proxy.peer_fetch` | Outbound `fetch` to `{peer}/api/a2a/jsonrpc`; child of the proxy span; propagates **`traceparent`** to the peer for trace chaining |
| `mesh.federation.manifest_fetch` | `GET` of the signed peers manifest (`fetchSignedFederationManifest`); child of the active context (e.g., peer resolution / `GET /api/mesh/federation/status`); W3C injection on the outbound request |
| `mesh.federation.probe.agent_card` | `GET` `/.well-known/agent-card.json` per origin during **`?probe=1`** mode; attribute `mesh.federation.peer_origin`; W3C injection |
| `http.server` (tracer **`hive.http`**) | Many API routes listed below: SERVER span with `http.route` (e.g., `GET /api/health`), `http.request.method`, `http.response.status_code`, `url.path`; inbound **`traceparent`** extraction as with the mesh |

The aliases **`/api/a2a/federated/jsonrpc`** and the main JSON-RPC path already go through `handleA2AJsonRpcPost`, so the same **`traceparent`** extraction as for `mesh.a2a.jsonrpc` applies to them.

Routes wrapped by **`withHttpServerSpan`** (non-exhaustive — grep `withHttpServerSpan` in `app/src/app/api` and `app/src/app/.well-known`): health, federation (status, directory), setup, agents (CRUD + start/stop/pause/resume/restart, SSE logs, stats, usage, MCP), models, import (parse + deploy), export, users/tokens/secrets (including `[id]`), backups (list + `[id]/status|restore|download`), config (root GET, reload, `[key]`), stats / network / update / inference / system audit, audit-logs, auth (register, registration status, forgot/reset password), A2A status, public discovery (`/.well-known/agent-card.json`, `/.well-known/hive-mesh.json`). **Excluded** from this helper: NextAuth (`auth/[...nextauth]`), and the JSON-RPC mounts already instrumented (`mesh.a2a.jsonrpc`, federation proxy).

Common attributes:

- `hive.entrypoint`: `main` \| `public_alias` \| `federated_alias` (physical mount)
- `rpc.method`: JSON-RPC method
- `http.status_code`: HTTP response status
- `mesh.a2a.outcome`: `ok` \| `jsonrpc_error` \| `exception` \| `invalid_json`

**SSE** requests: the span ends when the stream closes (duration includes streaming).

### W3C correlation (`traceparent`)

On **`POST` A2A JSON-RPC** (`handleA2AJsonRpcPost`), Hive extracts the **`traceparent`** and **`tracestate`** headers (W3C Trace Context) and records the `mesh.a2a.jsonrpc` span as a child of the upstream trace when `traceparent` is present. Configure the reverse proxy / API gateway to **not strip** these headers toward the Hive origin.

The SDK starts with **W3C trace context + baggage** propagation (`CompositePropagator` in `otel-bootstrap.ts`). **`AsyncLocalStorageContextManager`** is registered at boot in `instrumentation.ts` so that the OTel context survives `await` calls in the JSON-RPC handler (with or without OTLP export).

There is no auto-instrumentation agent `@opentelemetry/instrumentation-http` on all of Next: the handlers listed above go through **`withHttpServerSpan`** (`src/lib/otel-http-route.ts`). Outbound federation **`fetch`** calls outside the JWT proxy use **`meshOutboundFetch`** (`src/lib/otel-client-fetch.ts`).

## Metrics

Logical prefix `hive.mesh.*`:

| Instrument | Type | Description |
|------------|------|-------------|
| `hive.mesh.a2a.rpc.duration_ms` | Histogram | JSON-RPC processing duration (see above for streaming) |
| `hive.mesh.rate_limit.blocked_total` | Counter | Redis rate limit denials (sliding window), by **tier** |
| `hive.mesh.rate_limit.window_utilization_ratio` | Histogram | Estimated window fill after each check (0–1); high values = **saturation** |

Attribute `mesh.rate_limit.tier`:

- `public_a2a` — `hive:rl:public_a2a`
- `federation` — `hive:rl:federation`
- `a2a_jsonrpc` — `hive:rl:a2a` (Redis A2A middleware)
- `other` — other prefixes

RPC histogram metrics notably carry `mesh.a2a.outcome`, `hive.entrypoint`, `rpc.method`, and `mesh.a2a.streaming` when relevant.

## Typical SLO queries (Prometheus)

- **P99 RPC latency**: histogram quantile on `hive.mesh.a2a.rpc.duration_ms`
- **P99 latency per HTTP route**: no dedicated mesh histogram — use **`http.server`** traces + `http.route` attribute (tracer `hive.http`), or a span-metrics pipeline; see [`observability/README.md`](./observability/README.md#traces-http-hivehttp)
- **RL block rate**: `rate(hive_mesh_rate_limit_blocked_total[5m])` by `mesh_rate_limit_tier` (exact name depends on OTLP → Prometheus exposition)
- **Saturation**: distribution or threshold on `hive.mesh.rate_limit.window_utilization_ratio`

Exported names may be **normalized** by the backend (dots vs underscores); verify in the collector UI.

## Code files

- `app/src/lib/otel-bootstrap.ts` — SDK loading + OTLP exporters
- `app/src/lib/mesh-otel.ts` — mesh instruments + span helpers
- `app/src/lib/otel-http-route.ts` — `withHttpServerSpan` (tracer `hive.http`)
- `app/src/app/(dashboard)/observability/page.tsx` — **native** UI (Recharts + traces); `app/src/app/api/observability/prometheus/route.ts` — Prometheus proxy; `app/src/app/api/observability/tempo/*` — Tempo proxy (`TEMPO_OBSERVABILITY_URL`)
- `app/src/lib/otel-client-fetch.ts` — `meshOutboundFetch` (CLIENT + W3C inject)
- `app/src/lib/rate-limit.ts` — centralized RL observation
- `app/src/lib/a2a/jsonrpc-next.ts` — RPC span + histogram
- `app/src/lib/mesh-federation-manifest.ts` — signed manifest (span `mesh.federation.manifest_fetch`)
- `app/src/lib/mesh-federation-probe.ts` — agent card probes (span `mesh.federation.probe.agent_card`)
- `docs/observability/otel-collector-spanmetrics.example.yaml` — OTLP collector + **spanmetrics** (`namespace: hive_span`) → Prometheus
- `docs/observability/otel-collector-docker.local.yaml` — same + trace export to **Tempo** (stack `docker compose --profile otel`)
- `docs/observability/tempo-local.yaml`, `prometheus-otel-local.yml` — local observability stack (Docker `otel` profile)
- `app/scripts/check-api-routes-otel.cjs` — CI guardrail: API routes + `.well-known` must use `withHttpServerSpan` (excluding exemptions)
- `docs/observability/prometheus-rules.hive.yml` — Prometheus alerts (see [`ALERTING.md`](./ALERTING.md))

## See also

- [`observability/README.md`](./observability/README.md) — stack compose + reference PromQL + native `/observability` UI
- [`observability/ALERTING.md`](./observability/ALERTING.md) — Prometheus alerts
- [`PRE_PUBLIC_BETA_CHECKLIST.md`](./PRE_PUBLIC_BETA_CHECKLIST.md) — pre-opening checklist
- [MESH_GATEWAY_WAN.md](./MESH_GATEWAY_WAN.md) — dedicated federation reverse proxy
- [MESH_MTLS.md](./MESH_MTLS.md) — inter-instance mTLS (PKI)
- [TECH_VISION.md](./TECH_VISION.md) — long-term observability layer
