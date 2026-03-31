# Planetary Mesh Traceability (P1–P6)

> **Goal**: a single **doc ↔ machine artifacts ↔ Hive code** map — to be extended with each delivery.
> **Vision**: [`MESH_V2_GLOBAL.md`](./MESH_V2_GLOBAL.md) §3.1.

## Normative artifacts (machine-readable)

| Artifact | Path | Role |
|----------|------|------|
| JSON Schema P1 record | [`schemas/hive-registry-record-v1.schema.json`](./schemas/hive-registry-record-v1.schema.json) | Validate `GET /v1/records/{handle}` responses |
| OpenAPI registry read (draft) | [`openapi/registry-v1.yaml`](./openapi/registry-v1.yaml) | Clients / mocks / future gateway |
| OpenAPI P2 gateway ingress (draft) | [`openapi/gateway-v1.yaml`](./openapi/gateway-v1.yaml) | Edge TLS + JSON-RPC proxy + trace context |
| OpenAPI `/.well-known/hive-mesh.json` | [`openapi/hive-mesh-well-known.yaml`](./openapi/hive-mesh-well-known.yaml) | Public discovery (response = descriptor schema) |
| OpenAPI P3 transport bridge (draft) | [`openapi/transport-bridge-v1.yaml`](./openapi/transport-bridge-v1.yaml) | HTTP → bus (e.g. JetStream) — body = [`schemas/wan-envelope-v1.schema.json`](./schemas/wan-envelope-v1.schema.json) |
| OpenAPI internal WAN ingress | [`openapi/mesh-wan-ingress-v1.yaml`](./openapi/mesh-wan-ingress-v1.yaml) | `POST /api/mesh/wan/ingress` → Redis `hive:system:events` (`mesh.wan.envelope`) |
| JSON Schema P3 WAN envelope | [`schemas/wan-envelope-v1.schema.json`](./schemas/wan-envelope-v1.schema.json) | Ajv tests: [`app/src/lib/wan-envelope-schema.test.ts`](../app/src/lib/wan-envelope-schema.test.ts) |
| Local stack guide (NATS, stubs, curl, Docker) | [`MESH_PLANETARY_DEV_STACK.md`](./MESH_PLANETARY_DEV_STACK.md) | § **TL;DR** + § **Docker**; `docker-compose.yml` + `services/*/Dockerfile`; CI **planetary-docker** |
| P2 gateway Helm chart (K8s ref.) | [`deploy/helm/hive-mesh-gateway/`](../deploy/helm/hive-mesh-gateway/README.md) | Minimal deployment of the `services/gateway` stub |
| Instance descriptor (shipped) | [`schemas/hive-mesh-descriptor-v1.schema.json`](./schemas/hive-mesh-descriptor-v1.schema.json) | Impl. + Ajv tests: see "Hive code" table below |

## Human documentation

| Subject | File |
|---------|------|
| V2 phases & P1–P6 milestones | [`MESH_V2_GLOBAL.md`](./MESH_V2_GLOBAL.md) |
| P1 global directory | [`MESH_PLANETARY_P1_GLOBAL_DIRECTORY.md`](./MESH_PLANETARY_P1_GLOBAL_DIRECTORY.md) |
| CDC registry public (déploiement Internet, checklist prod) | [`CDC_REGISTRY_PUBLIC.md`](./CDC_REGISTRY_PUBLIC.md) |
| P2 WAN gateway (ADR) | [`MESH_PLANETARY_P2_WAN_GATEWAY.md`](./MESH_PLANETARY_P2_WAN_GATEWAY.md) |
| P3 multi-hop transport (ADR) | [`MESH_PLANETARY_P3_TRANSPORT.md`](./MESH_PLANETARY_P3_TRANSPORT.md) |
| P4 registry sync (DHT alternative) | [`MESH_PLANETARY_P4_FEDERATED_SYNC.md`](./MESH_PLANETARY_P4_FEDERATED_SYNC.md), DHT roadmap [`MESH_PLANETARY_P4_DHT_ROADMAP.md`](./MESH_PLANETARY_P4_DHT_ROADMAP.md) |
| P5 trust `proof` hook | [`MESH_PLANETARY_P5_TRUST_PROOF.md`](./MESH_PLANETARY_P5_TRUST_PROOF.md) |
| P6 W3C trace bridge → ingress | [`MESH_PLANETARY_P6_WAN_TRACE.md`](./MESH_PLANETARY_P6_WAN_TRACE.md) |
| Public JSON-RPC / reputation | [`MESH_PUBLIC_A2A.md`](./MESH_PUBLIC_A2A.md) |
| Embedded A2A integration | [`A2A_INTEGRATION.md`](./A2A_INTEGRATION.md) |
| Federation ops | [`MESH_FEDERATION_RUNBOOK.md`](./MESH_FEDERATION_RUNBOOK.md) |
| V1 adoption (risks, checklist, runbook) | [`MESH_PLANETARY_V1_ADOPTION.md`](./MESH_PLANETARY_V1_ADOPTION.md) |
| Planetary stub changelog | [`MESH_PLANETARY_CHANGELOG.md`](./MESH_PLANETARY_CHANGELOG.md) |
| libp2p DHT lab node | [`MESH_LIBP2P_DHT_NODE.md`](./MESH_LIBP2P_DHT_NODE.md) |
| Registrar SaaS + VC-JWT | [`MESH_REGISTRAR_SAAS_VC.md`](./MESH_REGISTRAR_SAAS_VC.md) |
| Multi-region SLO (ops) | [`observability/MULTI_REGION_SLO_RUNBOOK.md`](./observability/MULTI_REGION_SLO_RUNBOOK.md) |

## Current Hive code (level 0 → toward P1)

| Capability | Target milestone | Location (indicative) |
|------------|-----------------|----------------------|
| Mesh WAN contract version | P6 / cross-cutting | [`app/src/lib/mesh-version.ts`](../app/src/lib/mesh-version.ts) — `MESH_V2_CONTRACT_VERSION` + `PLANETARY_MESH_REFERENCE_VERSION` |
| Public instance descriptor | P1 "level 0" | [`hive-mesh.json/route.ts`](../app/src/app/.well-known/hive-mesh.json/route.ts) (`meshV2` + optional **`planetaryReferenceVersion`**), [`route.test.ts`](../app/src/app/.well-known/hive-mesh.json/route.test.ts), JSON Schema validation [`mesh-descriptor-schemas.test.ts`](../app/src/lib/mesh-descriptor-schemas.test.ts) |
| Operator status (`meshV2`, public tier) | P6 | [`app/src/lib/a2a/public-status.ts`](../app/src/lib/a2a/public-status.ts), `GET /api/a2a/status` |
| Federation + peer manifest | P1 "closed roster" | [`app/src/lib/mesh-federation*.ts`](../app/src/lib/) |
| P1 registry + write + P4 + Postgres + P5 proof | P1 / P4 / P5 ref | [`services/registry/`](../services/registry/) — `POST` / **`DELETE`**, **multi-tenant** (`REGISTRY_MULTI_TENANT`), **VC-JWT** gate ([`registry-vc-jwt.mjs`](../services/registry/src/registry-vc-jwt.mjs)), **PDP-lite** (`REGISTRY_POST_*_ALLOWLIST`), optional **HTTP PDP** (`REGISTRY_PDP_HTTP_URL` → [`registry-pdp-http.mjs`](../services/registry/src/registry-pdp-http.mjs)), **DHT hints** on health (`REGISTRY_DHT_BOOTSTRAP_*`), signed catalog + sync verify, metrics auth, RL, Postgres, P5 proof, `validUntil`; [`registry-proof.mjs`](../services/registry/src/registry-proof.mjs); `npm test` registry |
| P2 gateway (HTTP or TLS/mTLS, JSON-RPC proxy) | P2 | [`services/gateway/`](../services/gateway/) — `gateway-v1.yaml`; `GATEWAY_TLS_*` / `GATEWAY_MTLS_CA_PATH`; **`GET /v1/metrics`** (Prometheus); Helm + WAF Ingress examples; `GATEWAY_UPSTREAM_AUTH_SECRET` ↔ Hive `MESH_GATEWAY_INBOUND_SECRET`; `GATEWAY_BLOCK_USER_AGENTS`, `GATEWAY_SECURITY_HEADERS` |
| P3 transport bridge + P6 trace (HTTP stub, WanEnvelope → optional NATS) | P3 / P6 ref | [`services/transport-bridge/`](../services/transport-bridge/) — `npm start` / `npm run subscribe`; ingest retries; JetStream **ack/nak**; `wanEnvelope` + `meshTrace` → ingress headers |
| libp2p Kad-DHT (optional) | P4+ lab | [`services/libp2p-dht-node/`](../services/libp2p-dht-node/) — TCP + DHT + HTTP health; see [`MESH_LIBP2P_DHT_NODE.md`](./MESH_LIBP2P_DHT_NODE.md) |
| WAN ingress → Redis bus | P3 "product" | [`app/src/app/api/mesh/wan/ingress/route.ts`](../app/src/app/api/mesh/wan/ingress/route.ts), **`mesh.wan.envelope`** event in [`mesh-events.ts`](../app/src/lib/mesh-events.ts) |
| Redis worker `mesh.wan.envelope` | P3 "product" | [`app/scripts/mesh-wan-redis-worker.ts`](../app/scripts/mesh-wan-redis-worker.ts), parse [`mesh-wan-system-event-wire.ts`](../app/src/lib/mesh-wan-system-event-wire.ts), dispatch [`mesh-wan-redis-dispatch.ts`](../app/src/lib/mesh-wan-redis-dispatch.ts), tests [`mesh-wan-system-event-wire.test.ts`](../app/src/lib/mesh-wan-system-event-wire.test.ts); script **`mesh:wan-worker`** |
| Public JSON-RPC + keys + reputation + blocking | V2.3 | [`app/src/lib/a2a/a2a-jsonrpc-route-post.ts`](../app/src/lib/a2a/a2a-jsonrpc-route-post.ts), `public-*` |
| OTel metrics public tier | P6 | [`app/src/lib/mesh-otel.ts`](../app/src/lib/mesh-otel.ts) |

## Milestones → deliverables matrix (to be checked off as work progresses)

| Milestone | Doc | Schema / API | Dedicated service code |
|-----------|-----|--------------|------------------------|
| **P1** Global directory | P1 + this file | ✅ `hive-registry-record-v1` + `registry-v1.yaml` | ✅ [`services/registry`](../services/registry/) — read/write hardening, **POST allowlists**, revocation `DELETE`, signed catalog, P4 sync; operator TLS / IAM |
| **P2** WAN gateway | ADR P2 | ✅ `gateway-v1.yaml` (ingress) | ✅ stub [`services/gateway`](../services/gateway/) + Helm — optional **TLS** and **client mTLS** on the listener; TLS termination can remain at Ingress |
| **P3** Multi-hop transport | ✅ [`MESH_PLANETARY_P3_TRANSPORT.md`](./MESH_PLANETARY_P3_TRANSPORT.md) | ✅ `transport-bridge-v1.yaml` + **`wan-envelope-v1`** + **`mesh-wan-ingress-v1`** | ✅ bridge + subscriber → **`POST /api/mesh/wan/ingress`** → Redis; see [`MESH_PLANETARY_PRODUCT.md`](./MESH_PLANETARY_PRODUCT.md) |
| **P4** DHT / gossip | ✅ [`MESH_PLANETARY_P4_FEDERATED_SYNC.md`](./MESH_PLANETARY_P4_FEDERATED_SYNC.md); DHT → [`MESH_PLANETARY_P4_DHT_ROADMAP.md`](./MESH_PLANETARY_P4_DHT_ROADMAP.md) | ✅ `GET /v1/records` + signed catalog in [`openapi/registry-v1.yaml`](./openapi/registry-v1.yaml) | ✅ [`services/registry`](../services/registry/) `REGISTRY_SYNC_*`, record proof + **catalog proof**, `/v1/metrics` metrics |
| **P5** DID / VC | ✅ [`MESH_PLANETARY_P5_TRUST_PROOF.md`](./MESH_PLANETARY_P5_TRUST_PROOF.md) (Ed25519 + optional `controllerDid`; VC engines out of repo) | ✅ `proof` + `signingKid` + optional DID fields in schema | Ajv app + **`REGISTRY_VERIFY_ED25519_PROOF`** + PDP-lite env + `npm test` [`services/registry`](../services/registry/) |
| **P6** Multi-hop OTel | ✅ [`MESH_PLANETARY_P6_WAN_TRACE.md`](./MESH_PLANETARY_P6_WAN_TRACE.md) | — (NATS wire documented) | ✅ bridge + subscriber + ingress (W3C context); P2 gateway already forwards `traceparent` → upstream |

## Rules for contributors / agents

When a **planetary** piece is implemented:

1. Update **this table** (Pn row + code paths).
2. If JSON changes on the registry side: **bump** the `$id` or the `schema` field and document the migration in `MESH_PLANETARY_P1_GLOBAL_DIRECTORY.md`. For **`wan-envelope-v1`**: document in `MESH_PLANETARY_P3_TRANSPORT.md`, update the Ajv tests in the app, and verify that **`services/transport-bridge`** loads the same schema file (Ajv at startup).
3. If the instance ↔ peer contract changes: **bump** [`MESH_V2_CONTRACT_VERSION`](../app/src/lib/mesh-version.ts) and note the delta in `MESH_V2_GLOBAL.md`. If **stub / OpenAPI** contracts change for adopters: **bump** [`PLANETARY_MESH_REFERENCE_VERSION`](../app/src/lib/mesh-version.ts) and add an entry to [`MESH_PLANETARY_CHANGELOG.md`](./MESH_PLANETARY_CHANGELOG.md).
4. After editing `docs/schemas/*.json` or `docs/openapi/*.yaml`: `npm run docs:validate-planetary` (from `app/`).
5. After editing a stub under `services/*/src/server.mjs`: `npm run check` in that directory or the CI job **planetary-stubs** (`npm ci && npm run check && npm test` for **registry**; `npm ci && npm run check` for **transport-bridge** and **gateway**).
