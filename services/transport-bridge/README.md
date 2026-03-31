# Hive mesh transport bridge (P3 stub)

Draft implementation aligned with [`docs/openapi/transport-bridge-v1.yaml`](../../docs/openapi/transport-bridge-v1.yaml).

`POST /v1/publish` validates the body with **Ajv** against [**wan-envelope-v1**](../../docs/schemas/wan-envelope-v1.schema.json) (path relative to monorepo root by default), then optionally publishes to **NATS** (JetStream by default). Failures return **400** `{ "error": "invalid_envelope", "instancePath", "message" }`. Returns `202` with the same `correlationId`. Without `BRIDGE_NATS_URL`, accepted messages are no-ops (use `BRIDGE_LOG_PUBLISH=1` to log).

**P6 — Trace context**: if the HTTP request carries `traceparent` and/or `tracestate`, the NATS message is wrapped as `{ "wanEnvelope": <...>, "meshTrace": { "v": 1, ... } }`; the **subscriber** extracts the envelope for ingress and copies the W3C headers. Without headers, the NATS message remains the envelope alone (backward compatible). See [`docs/MESH_PLANETARY_P6_WAN_TRACE.md`](../../docs/MESH_PLANETARY_P6_WAN_TRACE.md).

## Docker

`docker build -f services/transport-bridge/Dockerfile .` from the root; the subscriber reuses the same image with `command: node src/subscriber.mjs` (see `docker-compose.yml`). Guide: [`docs/MESH_PLANETARY_DEV_STACK.md`](../../docs/MESH_PLANETARY_DEV_STACK.md).

## Kubernetes (Helm)

Reference chart: [`deploy/helm/hive-transport-bridge/README.md`](../../deploy/helm/hive-transport-bridge/README.md). JetStream stream example: [`docs/deploy/nats-jetstream-hive-mesh-wan.example.md`](../../docs/deploy/nats-jetstream-hive-mesh-wan.example.md).

## Smoke tests (NATS)

Script: [`scripts/p3-nats-smoke.mjs`](./scripts/p3-nats-smoke.mjs) (`npm run smoke:p3-nats`). Mode from **`SMOKE_NATS_MODE`** or **`BRIDGE_NATS_MODE`** (`core` \| `jetstream`).

**Core** (no JetStream):

```bash
docker run -d --name nats-smoke -p 4222:4222 nats:2.10-alpine
export BRIDGE_NATS_URL=nats://127.0.0.1:4222 BRIDGE_NATS_MODE=core SMOKE_NATS_MODE=core
export BRIDGE_INTERNAL_SECRET=dev-secret-min-32-characters-here-ok
node src/server.mjs &
npm run smoke:p3-nats
```

**JetStream:** start NATS with `-js`, create a stream covering `hive.mesh.wan` (see [`docs/deploy/nats-jetstream-hive-mesh-wan.example.md`](../../docs/deploy/nats-jetstream-hive-mesh-wan.example.md)), then `BRIDGE_NATS_MODE=jetstream` and `SMOKE_NATS_MODE=jetstream`.

**CI:** `planetary-stubs` runs **core** and **JetStream** smokes (JetStream uses `natsio/nats-box` to create stream `HIVE_MESH_WAN`).

**Kubernetes:** example **Job** / **CronJob** (in-cluster bridge + NATS): [`deploy/kubernetes/README.md`](../../deploy/kubernetes/README.md). **Helm:** optional HTTP Ingress — [`deploy/helm/hive-transport-bridge/README.md`](../../deploy/helm/hive-transport-bridge/README.md).

## Run

```bash
npm start
```

### Subscriber (demo)

In another terminal (same env vars as the bridge for URL / subject / mode):

```bash
npm run subscribe
```

Logs one line per message (`correlationId` prefix). JetStream mode **acks** each message.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4081` | Listen port |
| `BRIDGE_ENVELOPE_SCHEMA_PATH` | `docs/schemas/wan-envelope-v1.schema.json` (from repo root) | Absolute or relative path to the JSON Schema file |
| `BRIDGE_INTERNAL_SECRET` | _(empty)_ | If set, require `Authorization: Bearer <secret>` |
| `BRIDGE_MAX_BODY_BYTES` | `1048576` | Max JSON body |
| `BRIDGE_LOG_PUBLISH` | `0` | `1` = `console.log` each accepted envelope (dev only) |
| `BRIDGE_NATS_URL` | _(empty)_ | e.g. `nats://127.0.0.1:4222` — when set, each valid publish is sent to NATS |
| `BRIDGE_NATS_SUBJECT` | `hive.mesh.wan` | JetStream / core subject (stream must exist for JetStream — see NATS docs) |
| `BRIDGE_NATS_MODE` | `jetstream` | `jetstream` (default) or `core` for plain `nc.publish` |
| `BRIDGE_NATS_TLS` | _(off)_ | `1` / `true`: require a TLS session to NATS (use with server `tls_required` or public CAs) |
| `BRIDGE_NATS_TLS_CA_FILE` | _(empty)_ | PEM file path: trust anchor to verify the NATS server cert |
| `BRIDGE_NATS_TLS_CERT_FILE` | _(empty)_ | Client certificate PEM (mTLS toward NATS when paired with `KEY_FILE`) |
| `BRIDGE_NATS_TLS_KEY_FILE` | _(empty)_ | Client private key PEM |
| `BRIDGE_NATS_TLS_REJECT_UNAUTHORIZED` | _(default verify)_ | `0` / `false` / `off`: skip server cert verification (**lab only**) |
| `SUBSCRIBER_NATS_TLS*` | _(fallback)_ | Same semantics as `BRIDGE_NATS_TLS*` for the subscriber; subscriber-specific vars win when set |
| `BRIDGE_RATE_LIMIT_PER_MIN` | `0` | Max **`POST /v1/publish`** per client IP per minute (`0` = off) |
| `BRIDGE_MAX_URL_BYTES` | `8192` | Max request URL length → **414** |
| `BRIDGE_REQUEST_TIMEOUT_MS` | `0` | Incoming `requestTimeout` (`0` = Node default) |
| `BRIDGE_METRICS_AUTH_SECRET` | _(empty)_ | If set, `GET /v1/metrics` requires `Authorization: Bearer <secret>` |
| `HIVE_WAN_INGEST_DLQ_SUBJECT` | _(empty)_ | Subscriber only: after ingest retries fail, `publish` original bytes to this NATS subject |

Subscriber reuses **`SUBSCRIBER_NATS_*`** with fallback to **`BRIDGE_NATS_*`** (`URL`, `SUBJECT`, `MODE`, and the **`_NATS_TLS*`** variables above).

Optional **closed loop to Hive**: set **`HIVE_WAN_INGEST_URL`** (e.g. `http://127.0.0.1:3000/api/mesh/wan/ingress`) and **`HIVE_WAN_INGEST_TOKEN`** (same as **`HIVE_INTERNAL_TOKEN`**) to POST each decoded envelope to the app — publishes **`mesh.wan.envelope`** on Redis `hive:system:events`. Retries with backoff on **502/503/504/429/408** and network errors (`HIVE_WAN_INGEST_RETRIES`, default **3**; `HIVE_WAN_INGEST_RETRY_BASE_MS`, default **500**). **JetStream**: **`ack`** only after ingest success; **`nak`** on failure so the message can be redelivered (configure **max deliveries** on the stream against poison messages). After retries are exhausted, if **`HIVE_WAN_INGEST_DLQ_SUBJECT`** is set, the subscriber **`publish`**es the original message bytes to that NATS subject (DLQ).

`GET /v1/health` includes a small `nats` object (`enabled`, `mode`, `subject`, `tls` when NATS is enabled), plus `metricsPath` and `metricsAuthRequired`.

`GET /v1/metrics` exposes Prometheus counters (`hive_bridge_http_requests_total{method,path,code}`).

## Production deployment (reminder)

On an open network: **mTLS** or a strong secret (`BRIDGE_INTERNAL_SECRET`), NATS behind a firewall, and a JetStream **stream** aligned with `BRIDGE_NATS_SUBJECT` (or a covering subject) before expecting durable delivery. Prefer **`BRIDGE_NATS_TLS_*`** (and subscriber equivalents) toward NATS; Helm can mount a Secret — see [`deploy/helm/hive-transport-bridge/README.md`](../../deploy/helm/hive-transport-bridge/README.md) and [`docs/deploy/nats-jetstream-hive-mesh-wan.example.md`](../../docs/deploy/nats-jetstream-hive-mesh-wan.example.md) § TLS. See also DLQ (`HIVE_WAN_INGEST_DLQ_SUBJECT`) on the subscriber side.
