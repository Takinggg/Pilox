# Hive mesh gateway (P2 stub)

Draft implementation aligned with [`docs/openapi/gateway-v1.yaml`](../../docs/openapi/gateway-v1.yaml). Also exposes **`GET /v1/metrics`** (Prometheus text) for SLO / scraping.

## Docker

`docker build -f services/gateway/Dockerfile .` from the repository root (minimal image, no `npm install`). See also the **planetary** compose in [`docs/MESH_PLANETARY_DEV_STACK.md`](../../docs/MESH_PLANETARY_DEV_STACK.md).

## Kubernetes (Helm)

Reference chart: [`deploy/helm/hive-mesh-gateway/README.md`](../../deploy/helm/hive-mesh-gateway/README.md).

## Run

```bash
npm start
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4080` | Listen port |
| `GATEWAY_UPSTREAM_BASE` | `http://127.0.0.1:3000` | Hive origin (scheme + host + optional port) |
| `GATEWAY_JSONRPC_PATH` | `/api/a2a/jsonrpc/public` | Path on upstream for `POST /v1/a2a/jsonrpc` |
| `GATEWAY_MAX_BODY_BYTES` | `524288` | Max JSON body size for proxy |
| `GATEWAY_RATE_LIMIT_PER_MIN` | `0` | Per-client IP requests/minute for JSON-RPC; `0` = disabled |
| `GATEWAY_RATE_LIMIT_REDIS_URL` | _(empty)_ | When set (e.g. same Redis as Hive), rate limits are enforced with a **shared** sliding window across all gateway replicas; on Redis errors the gateway **falls back** to per-process memory (same as before) |
| `GATEWAY_UPSTREAM_AUTH_SECRET` | _(empty)_ | When set, adds `X-Hive-Gateway-Auth: Bearer <secret>` on the upstream request — must match Hive `MESH_GATEWAY_INBOUND_SECRET` |
| `GATEWAY_UPSTREAM_FORWARD_FOR` | `off` | `off` — no `X-Forwarded-For` toward Hive. `socket` — client TCP IP as seen by the gateway (for Hive public rate limits). `chain` — append TCP IP after inbound `X-Forwarded-For` (trusted LB only). |
| `GATEWAY_UPSTREAM_TIMEOUT_MS` | `0` | When &gt; 0, abort upstream `fetch` after this many ms → HTTP **504** `upstream_timeout` |
| `GATEWAY_BLOCK_USER_AGENTS` | _(empty)_ | Comma-separated substrings; if the inbound `User-Agent` contains one (case-insensitive), **`POST /v1/a2a/jsonrpc`** → **403** `user_agent_blocked` |
| `GATEWAY_TLS_CERT_PATH` | _(empty)_ | Path to PEM certificate — with `GATEWAY_TLS_KEY_PATH`, starts an **HTTPS** listener instead of HTTP |
| `GATEWAY_TLS_KEY_PATH` | _(empty)_ | Path to PEM private key |
| `GATEWAY_MTLS_CA_PATH` | _(empty)_ | If set (with TLS paths), enables **mutual TLS**: clients must present a cert signed by this CA |
| `GATEWAY_SECURITY_HEADERS` | `0` | `1`: `X-Content-Type-Options: nosniff` on JSON responses from the gateway |
| `GATEWAY_METRICS_AUTH_SECRET` | _(empty)_ | If set, **`GET /v1/metrics`** requires matching Bearer (timing-safe) |
| `GATEWAY_MAX_URL_BYTES` | _(8192)_ | Max raw request-line / URL bytes → **414** `uri_too_long` |
| `GATEWAY_REQUEST_TIMEOUT_MS` | `0` | Incoming socket `requestTimeout` in ms (`0` = Node default); e.g. **60000** in prod |

`traceparent` and `tracestate` are forwarded to upstream when present.

See [`docs/MESH_PLANETARY_DEV_STACK.md`](../../docs/MESH_PLANETARY_DEV_STACK.md).

## Production deployment (reminder)

As a public-facing frontend, **TLS** termination is in practice often handled at the **Ingress / LB** level; this stub can also listen in **HTTPS** or **mTLS** mode directly for internal topologies. Complete with WAF, error budgets, and cluster-side observability — the Helm chart exposes the TLS variables and `GATEWAY_SECURITY_HEADERS`.
