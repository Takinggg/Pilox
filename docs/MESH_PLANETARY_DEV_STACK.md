# Planetary Dev Stack (P1–P3) — local end-to-end

> Objective: run **registry**, **gateway**, **transport-bridge**, **subscriber**, **NATS**, and **Hive** on a single machine, without assuming any required order beyond network dependencies. **Déploiement cible (ordre prod, secrets) :** [`MESH_WAN_COMPLETE_DEPLOYMENT.md`](./MESH_WAN_COMPLETE_DEPLOYMENT.md).

## TL;DR (simplest path)

1. **NATS + planetary stubs**: at the repo root, `docker compose up -d --build` (starts NATS, registry, gateway, bridge, subscriber).
2. **Bus mode without JetStream**: to avoid stream creation, use **`BRIDGE_NATS_MODE=core`** and **`SUBSCRIBER_NATS_MODE=core`** (same `BRIDGE_NATS_URL` / subject).
3. **Registry**: `cd services/registry && npm ci` then `REGISTRY_SEED_RECORD=./seed-record.example.json npm start` (PowerShell: `$env:REGISTRY_SEED_RECORD="seed-record.example.json"` before `npm start`). Catalog: `GET http://127.0.0.1:4077/v1/records`; **P4 sync**: `REGISTRY_SYNC_PEER_BASES=http://127.0.0.1:4078` + `REGISTRY_SYNC_INTERVAL_MS=60000` on a 2nd instance (see [`MESH_PLANETARY_P4_FEDERATED_SYNC.md`](./MESH_PLANETARY_P4_FEDERATED_SYNC.md)). **Postgres**: start a database (e.g. `postgres:16` on port 5433) then `REGISTRY_DATABASE_URL=postgres://user:pass@127.0.0.1:5433/registry` — table `hive_registry_records` created on startup. **Ed25519 proof**: `REGISTRY_VERIFY_ED25519_PROOF=1` (see [`MESH_PLANETARY_P5_TRUST_PROOF.md`](./MESH_PLANETARY_P5_TRUST_PROOF.md)). **Write**: `REGISTRY_WRITE_SECRET=<secret>` then `curl -sS -X POST http://127.0.0.1:4077/v1/records -H "Authorization: Bearer <secret>" -H "Content-Type: application/json" -d @record.json` (see [`openapi/registry-v1.yaml`](./openapi/registry-v1.yaml)).
4. **Gateway**: `cd services/gateway && npm start` (`GATEWAY_UPSTREAM_BASE=http://127.0.0.1:3000` if Next is running in dev on 3000).
5. **Bridge**: `cd services/transport-bridge && npm ci` then `BRIDGE_NATS_URL=nats://127.0.0.1:4222` + `BRIDGE_NATS_MODE=core` + `npm start`.
6. **Subscriber** (another terminal): same directory, same URL/subject/mode **core**, `npm run subscribe`.
7. **Hive**: `cd app && npm run dev` (Redis/Postgres as usual).
8. **Smoke**: with everything started, `cd app && npm run smoke:planetary`.

**All-in-Docker (Hive app + stubs + NATS)**: from `docker/`,  
`docker compose -f docker-compose.local.yml up -d --build` (after Postgres/Redis from `app/docker-compose.yml` on `hive-network`). Planetary services join the same network; gateway defaults to **`http://hive-app:3000`**.

**Repo root (stubs + NATS only, Hive on host)**: `docker compose up -d --build`.  
Add **`--profile planetary-dht`** to also run the libp2p DHT lab node on port **4092** (`services/libp2p-dht-node`).
The images embed schemas under `docs/schemas/`. Root compose: gateway uses `host.docker.internal` by default (`PLANETARY_GATEWAY_UPSTREAM_BASE` to override). Details: § *Docker Compose (planetary stack)* below.

The details (JetStream, `curl`, `X-Forwarded-For`, gateway secrets) are in the following sections.

## 1. Prerequisites

- **Node.js** ≥ 22
- **Docker** (optional but recommended for NATS)
- Repo cloned at the `Hive/` root (paths below are relative to this root).

## 2. NATS + JetStream

```bash
docker compose up -d
```

HTTP monitoring: `http://127.0.0.1:8222` (varz, health depending on image).

### JetStream stream (required if `BRIDGE_NATS_MODE=jetstream`)

Without a stream covering the subject, JetStream publish may fail (503 on the bridge side). One-time creation with **nats-box**:

```bash
docker run --rm -it --network host natsio/nats-box:latest \
  nats --server nats://127.0.0.1:4222 stream add HIVE_MESH_WAN \
  --subjects "hive.mesh.>" \
  --storage file \
  --retention limits \
  --defaults
```

Verify: `nats --server nats://127.0.0.1:4222 stream info HIVE_MESH_WAN`.

### **Core** mode (without JetStream)

For a minimal test without creating a stream: `BRIDGE_NATS_MODE=core` and `SUBSCRIBER_NATS_MODE=core` (same subject, e.g. `hive.mesh.wan`).

## 3. P1 Registry (`services/registry`)

```bash
cd services/registry
npm ci
# PowerShell: $env:REGISTRY_SEED_RECORD="seed-record.example.json"
# bash:       export REGISTRY_SEED_RECORD=./seed-record.example.json
npm start
```

Health: `GET http://127.0.0.1:4077/v1/health` — the body includes the schema **`$id`** when Ajv is active.

## 4. Hive (Next app)

```bash
cd app
npm ci
npm run dev
```

Configure at minimum **Redis**, **Postgres**, **A2A** per `.env.example`. For public JSON-RPC behind the gateway with per-real-IP quota:

- `GATEWAY_UPSTREAM_FORWARD_FOR=socket` (or `chain`) on the gateway (see §6).

## 5. P2 Gateway (`services/gateway`)

```bash
cd services/gateway
npm start
```

Example: `GATEWAY_UPSTREAM_BASE=http://127.0.0.1:3000` (Next.js dev port).

**Multi-replica / shared quota**: set **`GATEWAY_RATE_LIMIT_REDIS_URL`** (same Redis as Hive) so JSON-RPC rate limits use one sliding window across all gateway pods; if Redis errors, the gateway falls back to per-process memory.

## 6. `X-Forwarded-For` to Hive

Hive already reads `x-forwarded-for` (first hop) for public JSON-RPC rate limiting (`a2a-jsonrpc-route-post`). The gateway can attach the client's TCP IP:

| `GATEWAY_UPSTREAM_FORWARD_FOR` | Behavior |
|--------------------------------|----------|
| `off` *(default)* | No `X-Forwarded-For` to Hive → Hive sees the gateway's IP. |
| `socket` | `X-Forwarded-For: <TCP IP of the client as seen by the gateway>`. |
| `chain` | If the client already sent `X-Forwarded-For`, sends `value, TCP_IP`; otherwise same as `socket`. |

**Security**: only use `chain` if the gateway is behind a trusted LB; otherwise prefer `socket`.

## 7. Transport-bridge + subscriber P3

Terminal A:

```bash
cd services/transport-bridge
npm ci
set BRIDGE_NATS_URL=nats://127.0.0.1:4222
set BRIDGE_NATS_SUBJECT=hive.mesh.wan
npm start
```

Terminal B:

```bash
cd services/transport-bridge
set SUBSCRIBER_NATS_URL=nats://127.0.0.1:4222
set SUBSCRIBER_NATS_SUBJECT=hive.mesh.wan
npm run subscribe
```

Test publish (body conforming to `docs/schemas/wan-envelope-v1.schema.json`):

```bash
curl -sS -X POST http://127.0.0.1:4081/v1/publish ^
  -H "Content-Type: application/json" ^
  -d "{\"v\":1,\"correlationId\":\"test-demo-123456\",\"sourceOrigin\":\"https://client.example\"}"
```

The subscriber should log a `correlationId`.

### Closed loop to Hive (ingest)

1. Set **`HIVE_INTERNAL_TOKEN`** (or an **operator** API token) on Hive — see `app/.env.example` / [`PRODUCTION.md`](./PRODUCTION.md).
2. On the **subscriber** (`npm run subscribe` or the `planetary-subscriber` container):

   - `HIVE_WAN_INGEST_URL=http://127.0.0.1:3000/api/mesh/wan/ingress` (adjust host/port; from Docker to the host machine: `http://host.docker.internal:3000/...`).
   - `HIVE_WAN_INGEST_TOKEN=<same value as HIVE_INTERNAL_TOKEN>`.

3. Each valid JSON NATS message is forwarded as a **POST** to Hive; the app publishes **`mesh.wan.envelope`** on **`hive:system:events`** (same channel as other system events, with `meshMeta` / `meshSig` if `MESH_BUS_HMAC_SECRET` is defined). If the bridge's **POST /v1/publish** receives the **`traceparent` / `tracestate`** headers, the subscriber copies them to the ingress request (OTel parent) — see [`MESH_PLANETARY_P6_WAN_TRACE.md`](./MESH_PLANETARY_P6_WAN_TRACE.md).

4. **(Optional)** Additional terminal: `cd app && npm run mesh:wan-worker` (same **`REDIS_URL`** as Hive). By default **`MESH_WAN_REDIS_WORKER_MODE=log`** (one JSON line per envelope on stdout). **`webhook`** mode: set **`MESH_WAN_REDIS_WORKER_WEBHOOK_URL`** and **`MESH_WAN_REDIS_WORKER_WEBHOOK_BEARER`** (see `app/.env.example`).

OpenAPI: [`openapi/mesh-wan-ingress-v1.yaml`](./openapi/mesh-wan-ingress-v1.yaml).

## 8. HTTP smoke test (optional)

From the repo root, with the stubs already running:

```bash
node scripts/planetary-smoke.mjs
```

Optional: `PLANETARY_REGISTRY_URL`, `PLANETARY_GATEWAY_URL`, `PLANETARY_BRIDGE_URL`, for protected metrics `PLANETARY_REGISTRY_METRICS_BEARER` / `PLANETARY_GATEWAY_METRICS_BEARER`, and `PLANETARY_BRIDGE_EXPECT_TLS=1` to require `nats.tls === true` when the bridge reports NATS enabled (see `scripts/planetary-smoke.mjs`).

## 9. Docker Compose (planetary stack)

| Service | Image | Host port | Role |
|---------|-------|-----------|------|
| `nats` | `nats:2.10-alpine` | 4222, 8222 | Bus (starts with `docker compose up`) |
| `planetary-registry` | build `services/registry/Dockerfile` | 4077 | P1 |
| `planetary-gateway` | build `services/gateway/Dockerfile` | 4080 | P2 → `host.docker.internal` |
| `planetary-bridge` | build `services/transport-bridge/Dockerfile` | 4081 | P3, `BRIDGE_NATS_MODE` default **core** |
| `planetary-subscriber` | same image, `CMD` subscriber | — | Message logs |

Commands:

```bash
docker compose up -d --build
# Optional DHT lab node:
# docker compose --profile planetary-dht up -d --build
```

Environment variables (`.env` file at root or shell): `PLANETARY_GATEWAY_UPSTREAM_BASE`, `PLANETARY_GATEWAY_JSONRPC_PATH`, `PLANETARY_BRIDGE_SUBJECT`, `PLANETARY_BRIDGE_NATS_MODE`, **`PLANETARY_BRIDGE_INTERNAL_SECRET`** (override the compose default before any shared network).

**Linux**: `extra_hosts: host.docker.internal:host-gateway` is already in the compose for the gateway. If Hive runs elsewhere, override `PLANETARY_GATEWAY_UPSTREAM_BASE`.

Manual image build: `docker build -f services/registry/Dockerfile .` (from the repo root).

## 10. Traceability

Artifacts and update rules: [`MESH_PLANETARY_TRACE.md`](./MESH_PLANETARY_TRACE.md).
