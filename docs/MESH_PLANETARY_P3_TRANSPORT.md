# P3 — WAN Multi-hop Transport (draft ADR)

> **Status**: proposal — to be validated before any heavy infrastructure investment.
> **Link**: [`MESH_V2_GLOBAL.md`](./MESH_V2_GLOBAL.md) §3.1 (milestone **P3**), [`MESH_PLANETARY_TRACE.md`](./MESH_PLANETARY_TRACE.md).

## Context

- Hive (Next) and the **P2 gateway** terminate HTTP JSON-RPC; the **planetary** mesh often requires **durable queues**, **replay**, and **decoupling** between regions.
- Redis alone is a **poor WAN pivot** for all use cases (latency, multi-region consistency, cost).

## Proposed decision (MVP)

**Single pivot: NATS JetStream** (cluster or hub + *leaf nodes* per site).

- **Why**: pub/sub model + streams + consumers with ack, documented multi-site deployments, no DHT to manage in transport v1.
- **Alternatives** rejected for MVP: **libp2p** alone (ops complexity), **Redis Streams** cross-DC (without a dedicated layer), **Kafka** (acceptable but heavier for a first step).

## Roles

| Component | Role |
|-----------|------|
| **Gateway P2** | Authenticates the client, attaches `traceparent`, publishes a signed / correlated **envelope** on a JetStream subject (or calls a minimal HTTP **bridge**). |
| **Bridge** (optional) | Small service if NATS should not be embedded in the gateway: HTTP `POST` → `JetStream.Publish`. Contract: [`openapi/transport-bridge-v1.yaml`](./openapi/transport-bridge-v1.yaml). Node impl.: [`../services/transport-bridge/`](../services/transport-bridge/) — without `BRIDGE_NATS_URL` = noop; with = JetStream publish (default) or core NATS. |
| **Hive (worker)** | Shipped reference: **`POST /api/mesh/wan/ingress`** (operator token / `HIVE_INTERNAL_TOKEN`) republishes the envelope on Redis `hive:system:events` as **`mesh.wan.envelope`**; existing or future business subscribers on this channel. |

## Logical envelope

Canonical schema: [`schemas/wan-envelope-v1.schema.json`](./schemas/wan-envelope-v1.schema.json) (OpenAPI `transport-bridge-v1` `$ref`s this file). **Top-level `additionalProperties` are disallowed** (strict contract); opaque data lives under **`payload`** (`payload.additionalProperties` allowed).

- `v`, `correlationId`, `sourceOrigin`, `targetOrigin` (or `targetHandle` resolved via P1), `payload` (JSON bounded by policy), optional `schema: wan-envelope-v1`.

## Non-decisions

- Exact topology (single global cluster vs leaf per tenant).
- Max message size and spill policy to object storage.

## MVP P3 acceptance criteria

1. A message published at site A is **consumed** at site B with **at least one** documented JetStream retry policy.
2. `correlationId` / `traceparent` present **end-to-end** in the logs of all three components (gateway, bridge, Hive worker).
3. Broker outage → **degraded** behavior documented (no silent loss without awareness).

---

## Implementation matrix (repository state)

| Capability | Status | Notes / location |
|------------|--------|------------------|
| **WAN envelope JSON Schema** (`wan-envelope-v1`) | **Shipped** | [`schemas/wan-envelope-v1.schema.json`](./schemas/wan-envelope-v1.schema.json) |
| **OpenAPI transport bridge** | **Shipped** | [`openapi/transport-bridge-v1.yaml`](./openapi/transport-bridge-v1.yaml) |
| **HTTP `POST /v1/publish`** + Ajv validation | **Shipped** | [`services/transport-bridge/`](../services/transport-bridge/) |
| **NATS JetStream (or core) publish** from bridge | **Partial** | Requires `BRIDGE_NATS_URL` + operator-provisioned **stream** / subject; without URL = **no-op** accept |
| **NATS client TLS / mTLS** (bridge + subscriber) | **Shipped** | `BRIDGE_NATS_TLS*` / `SUBSCRIBER_NATS_TLS*` + Helm `natsTls` — [`nats-jetstream-hive-mesh-wan.example.md`](./deploy/nats-jetstream-hive-mesh-wan.example.md) § TLS |
| **CI smoke** (bridge → NATS) | **Shipped** | [`services/transport-bridge/scripts/p3-nats-smoke.mjs`](../services/transport-bridge/scripts/p3-nats-smoke.mjs) — **core** + **JetStream**; CI: `planetary-stubs` |
| **Trace context on NATS wire** (`meshTrace`) | **Shipped** | See [`MESH_PLANETARY_P6_WAN_TRACE.md`](./MESH_PLANETARY_P6_WAN_TRACE.md) |
| **Subscriber → Hive `POST /api/mesh/wan/ingress`** | **Shipped** | `HIVE_WAN_INGEST_URL` + token; JetStream ack/nak, DLQ subject optional |
| **Hive → Redis `mesh.wan.envelope`** | **Shipped** | Ingress republishes to `hive:system:events`; workers / [`mesh-wan-redis-dispatch`](../app/src/lib/mesh-wan-redis-dispatch.ts) |
| **P2 Gateway JSON-RPC proxy** | **Shipped** | [`services/gateway/`](../services/gateway/) — not the same binary as bridge |
| **Helm chart for P1 registry** | **Shipped** | [`deploy/helm/hive-registry/`](../deploy/helm/hive-registry/README.md) (CI: `helm-template`) |
| **Multi-site JetStream “A → B” with SLO** | **Proposed / lab** | [`docs/deploy/p3-jetstream-multi-site-lab.md`](./deploy/p3-jetstream-multi-site-lab.md) + staging [`p3-multi-region-synthetic-check.md`](./deploy/p3-multi-region-synthetic-check.md); CI remains single-cluster JetStream smoke |
| **Gateway speaks NATS directly** | **Not in repo** | Design keeps gateway on **HTTP**; NATS via **bridge** |

### Suggested follow-up work (file as issues)

1. ~~**Helm chart** for `transport-bridge` + subscriber~~ — shipped: [`deploy/helm/hive-transport-bridge/`](../deploy/helm/hive-transport-bridge/README.md) (CI: `helm-template` job).
2. **JetStream stream** — operator example: [`docs/deploy/nats-jetstream-hive-mesh-wan.example.md`](./deploy/nats-jetstream-hive-mesh-wan.example.md); **multi-site lab:** [`docs/deploy/p3-jetstream-multi-site-lab.md`](./deploy/p3-jetstream-multi-site-lab.md). **CI:** stream `HIVE_MESH_WAN` created in `planetary-stubs` JetStream smoke.
3. ~~**mTLS** for bridge ingress and NATS client certs~~ — HTTP edge: [`docs/deploy/edge-tls-mesh-services.md`](./deploy/edge-tls-mesh-services.md) + [`MESH_MTLS.md`](./MESH_MTLS.md). **NATS client TLS:** env `BRIDGE_NATS_TLS*` / `SUBSCRIBER_NATS_TLS*` + Helm `natsTls` — [`docs/deploy/nats-jetstream-hive-mesh-wan.example.md`](./deploy/nats-jetstream-hive-mesh-wan.example.md) § TLS.
4. **Synthetic check** (staging runbook): [`docs/deploy/p3-multi-region-synthetic-check.md`](./deploy/p3-multi-region-synthetic-check.md). **Local / CI loopback:** `npm run smoke:p3-nats` (`core` / `jetstream` via env — see CI `planetary-stubs`).
5. ~~**Back-pressure**~~ — [`docs/deploy/p3-wan-backpressure.md`](./deploy/p3-wan-backpressure.md) (limits per hop, object-store indirection).

## References

- [`MESH_PLANETARY_P2_WAN_GATEWAY.md`](./MESH_PLANETARY_P2_WAN_GATEWAY.md)
- [`openapi/transport-bridge-v1.yaml`](./openapi/transport-bridge-v1.yaml)
- [`MESH_V1_REDIS_BUS.md`](./MESH_V1_REDIS_BUS.md) — Redis bus (`mesh.wan.envelope` path)
- [`services/gateway/README.md`](../services/gateway/README.md) — P2 gateway stub
- [`MESH_WAN_COMPLETE_DEPLOYMENT.md`](./MESH_WAN_COMPLETE_DEPLOYMENT.md) — guide opérateur (stack complète)
- [`MESH_WORLD_NETWORK_EPIC.md`](./MESH_WORLD_NETWORK_EPIC.md) — planning issues (transport, DHT, policy, SLO)
- [`deploy/helm/README.md`](../deploy/helm/README.md) — Helm chart index
- [`deploy/helm/hive-transport-bridge/README.md`](../deploy/helm/hive-transport-bridge/README.md) — Kubernetes chart
- [`docs/deploy/nats-jetstream-hive-mesh-wan.example.md`](./deploy/nats-jetstream-hive-mesh-wan.example.md) — JetStream stream example
- [`docs/deploy/p3-wan-backpressure.md`](./deploy/p3-wan-backpressure.md) — payload limits per hop
- [`docs/deploy/p3-multi-region-synthetic-check.md`](./deploy/p3-multi-region-synthetic-check.md) — staging A→B checklist
- [`docs/deploy/p3-jetstream-multi-site-lab.md`](./deploy/p3-jetstream-multi-site-lab.md) — two-footprint JetStream lab
