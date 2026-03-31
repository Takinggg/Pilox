# Changelog — planetary mesh (in-repo reference)

All notable changes to **stub contracts** (OpenAPI under `docs/openapi/`, JSON Schemas under `docs/schemas/` relevant to P1–P3 + registry sync/proof) are summarized here. Bump [`PLANETARY_MESH_REFERENCE_VERSION`](../app/src/lib/mesh-version.ts) when adopters must react (breaking = major, additive = minor, docs/fixes = patch).

The Hive instance ↔ federation string remains [`MESH_V2_CONTRACT_VERSION`](../app/src/lib/mesh-version.ts) — bump that file when **peer-visible** Hive behavior changes, and document in `MESH_V2_GLOBAL.md` per [`MESH_PLANETARY_TRACE.md`](./MESH_PLANETARY_TRACE.md).

## [1.3.1] — 2026-03-22

### Added

- **Operator guide** — [`MESH_WAN_COMPLETE_DEPLOYMENT.md`](./MESH_WAN_COMPLETE_DEPLOYMENT.md) (order Helm + Docker, secrets matrix, TLS, verification links).
- **Kubernetes smoke examples** — `deploy/kubernetes/p3-bridge-nats-smoke-*.example.yaml` (Job + CronJob, core + JetStream); `scripts/validate-k8s-example-yaml.py` validates the directory in CI.
- **Helm** — optional `bridge.ingress` on `hive-transport-bridge`; `services/transport-bridge` image ships `scripts/` for in-cluster smoke.

### Changed

- **Root `docker-compose.yml`** — `planetary-bridge` sets **`BRIDGE_INTERNAL_SECRET`** via `PLANETARY_BRIDGE_INTERNAL_SECRET` (lab default documented).

### CI

- **planetary-smoke** — runs **`npm run smoke:p3-nats`** (core) against the compose bridge (secret aligned with compose default).
- **helm-template** — validates all `deploy/kubernetes/*.example.yaml`.

## [1.3.0] — 2025-03-21

### Changed (breaking)

- **`wan-envelope-v1`** JSON Schema: **`additionalProperties: false`** at the root — unknown top-level keys are rejected (put extensions under **`payload`**). Zod ingress schema aligned (`.strict()`). Gateway: optional **`GATEWAY_RATE_LIMIT_REDIS_URL`** for shared rate limits across replicas (Dockerfile now runs `npm ci`).

### Added

- **`HIVE_CLIENT_IP_SOURCE`** (Hive app) — configurable derivation of client IP for public A2A RL and federation inbound allowlist (`auto` / `real_ip` / `xff_first` / `xff_last`). Docs: `PRODUCTION.md` §4.1, `MESH_MTLS.md`, `MESH_FEDERATION_RUNBOOK.md`.
- **WAN Redis worker**: webhook delivery retries with exponential backoff (`MESH_WAN_WEBHOOK_MAX_ATTEMPTS`, `MESH_WAN_WEBHOOK_RETRY_BASE_MS`).

## [1.2.0] — 2025-03-20

### Added

- **`services/libp2p-dht-node/`** — real **libp2p + Kad-DHT** (TCP, identify, ping, optional bootstrap). HTTP **`GET /v1/health`** on `LIBP2P_HEALTH_PORT` (default **4092**). Lab / staging reference, not wired into Hive core.
- **Registry multi-tenant SaaS mode** — `REGISTRY_MULTI_TENANT=1`, tenant via **`REGISTRY_TENANT_HEADER`** (default `X-Hive-Registry-tenant`). Storage key namespaces logical handles; P4 sync requires **`REGISTRY_SYNC_LOCAL_TENANT`**; optional **`REGISTRY_SYNC_PEER_TENANT`** on outbound catalog fetches.
- **Registry VC-JWT gate** — `REGISTRY_VC_JWKS_URL` + `REGISTRY_VC_REQUIRED=1`; verifies **JWT** with a **`vc`** claim via JWKS (optional **`sub`** ↔ `controllerDid`). Dependency **`jose`**. Not a full JSON-LD VC processor (no SD-JWT, no selective disclosure, no status list 2021 in code).
- **Multi-region SLO runbook** — [`docs/observability/MULTI_REGION_SLO_RUNBOOK.md`](./observability/MULTI_REGION_SLO_RUNBOOK.md) + cluster-labelled examples in [`prometheus-slo-mesh.example.yml`](./observability/prometheus-slo-mesh.example.yml). **Operated** SLO remains your Prometheus + Alertmanager (and optional Hive `/observability`) deployment.

### CI

- **planetary-stubs** includes **`services/libp2p-dht-node`** (`npm ci` + `npm run check`).

## [1.0.1] — 2025-03-20

### Added

- **`planetaryReferenceVersion`** on `GET /.well-known/hive-mesh.json` (optional in JSON Schema; always set by current Hive app). Same semver as `PLANETARY_MESH_REFERENCE_VERSION` in `app/src/lib/mesh-version.ts`.
- **`publicMesh.dhtBootstrapHints`** from **`MESH_PUBLIC_DHT_BOOTSTRAP_URLS`** (Hive); registry **`GET /v1/health`** echoes **`REGISTRY_DHT_BOOTSTRAP_HINTS`** / **`REGISTRY_DHT_BOOTSTRAP_URLS`**.
- **External HTTP PDP** on registry **`POST /v1/records`** (`REGISTRY_PDP_HTTP_*`) — OPA-shaped request / pluggable decision JSON.
- **Observability**: example SLO recording rules [`docs/observability/prometheus-slo-mesh.example.yml`](./observability/prometheus-slo-mesh.example.yml) (optional).

### Fixed

- **Gateway Docker image** copied only `server.mjs` while the process imports `gateway-metrics.mjs` and `gateway-bearer.mjs` — image now includes all three files.

### CI

- **planetary-smoke**: Docker Compose (`--build`) + wait on `/v1/health` + `scripts/planetary-smoke.mjs` on every PR/push.

### Tooling

- **`scripts/planetary-smoke.mjs`**: accept Prometheus `TYPE …_http_requests_total` (stub metric names); read metrics body before treating non-401 errors (avoids flaky Node on Windows).

## [1.0.0] — 2025-03-20

### Reference scope (V1 adoptable)

- **P1**: Registry read/write/delete, rate limits, catalog Bearer, signed catalog, `validUntil`, Postgres, PDP-lite allowlists, metrics with optional Bearer.
- **P2**: Gateway JSON-RPC proxy, optional TLS/mTLS, security headers, UA block, metrics auth, Helm chart with HPA/PDB/ServiceMonitor/PrometheusRule templates.
- **P3**: Transport bridge + subscriber → Hive `POST /api/mesh/wan/ingress` → Redis `mesh.wan.envelope`; envelope schema + trace propagation (P6 hook).
- **P4–P5**: Pull sync with optional proof verification; Ed25519 `proof` on records; not a public DHT or full VC engine.
- **Docs**: traceability [`MESH_PLANETARY_TRACE.md`](./MESH_PLANETARY_TRACE.md), product bounds [`MESH_PLANETARY_PRODUCT.md`](./MESH_PLANETARY_PRODUCT.md), adoption [`MESH_PLANETARY_V1_ADOPTION.md`](./MESH_PLANETARY_V1_ADOPTION.md).

### Ops / tooling

- CI: planetary stubs + `docs:validate-planetary` + planetary Docker build.
- Smoke script: `app` → `npm run smoke:planetary`.
