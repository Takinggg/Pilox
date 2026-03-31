# Planetary Mesh — Product Scope (MVP shipped in the repository)

> **Objective**: describe what is **shipped** as a minimal P1–P6 product **reference** (discovery, edge, WAN bus → Hive, directory sync, trust hook, WAN traces), without conflating it with a **production Internet-scale** deployment (DHT, VC, full chart).

## P4–P6 milestones (repository reference)

The "complete" milestones in the **vision** sense [`MESH_V2_GLOBAL.md`](./MESH_V2_GLOBAL.md) (libp2p DHT, verified DID/VC, multi-region SLO) remain largely **roadmap**. This repository provides documented **reference implementations**:

| Milestone | Shipped here (stub / ref.) | Not covered |
|-----------|---------------------------|-------------|
| **P4** | Pull sync (`REGISTRY_SYNC_*`), outbound auth (`REGISTRY_SYNC_AUTH_BEARER`), proof verification on merge (`REGISTRY_SYNC_VERIFY_ED25519_PROOF`), read RL + protected catalog — see [`MESH_PLANETARY_P4_FEDERATED_SYNC.md`](./MESH_PLANETARY_P4_FEDERATED_SYNC.md) | DHT, gossip, public NAT relays, "Internet scale" catalog trust |
| **P5** | **`proof`**, **Ed25519** (GET/POST + sync), Postgres, optional **PDP-lite** on POST (`REGISTRY_POST_*_ALLOWLIST`), optional **VC-JWT** gate + **multi-tenant** registry — [`MESH_PLANETARY_P5_TRUST_PROOF.md`](./MESH_PLANETARY_P5_TRUST_PROOF.md), [`MESH_REGISTRAR_SAAS_VC.md`](./MESH_REGISTRAR_SAAS_VC.md) | Full JSON-LD VC lifecycle, SD-JWT, status lists, enterprise PDP products (OPA/Cedar SaaS) |
| **P6** | **`traceparent`** propagation bridge → NATS → subscriber → ingress — see [`MESH_PLANETARY_P6_WAN_TRACE.md`](./MESH_PLANETARY_P6_WAN_TRACE.md) | SLO, mandatory inter-region dashboards |
| **K8s ops** | Helm **gateway + bridge + registry** — index [`deploy/helm/README.md`](../deploy/helm/README.md); assembly guide [`MESH_WAN_COMPLETE_DEPLOYMENT.md`](./MESH_WAN_COMPLETE_DEPLOYMENT.md); gateway detail (HPA/PDB, metrics, …) [`deploy/helm/hive-mesh-gateway/README.md`](../deploy/helm/hive-mesh-gateway/README.md) | Managed WAF SKUs, full multi-region SLO program |

## Executive summary

| Layer | Status | Role |
|-------|--------|------|
| **P1 Directory** | Stub + schema + Docker | Read + **POST** / **DELETE**, RL, catalog Bearer, signed catalog, `validUntil`, Postgres, **POST allowlists** (handle / agent-card host). |
| **P2 Gateway** | Stub + Docker | JSON-RPC proxy + upstream auth + optional **TLS / mTLS** on the listener + UA guard + security headers. |
| **P3 Transport** | Bridge + subscriber + **Hive ingress** | NATS (core or JetStream); validated envelope; **closed loop**: subscriber → `POST /api/mesh/wan/ingress` → Redis `hive:system:events` (`mesh.wan.envelope`). |
| **P4–P6 (ref.)** | Directory sync + `proof` + WAN traces | See table § *P4–P6 milestones* above; not equivalent to production DHT / VC / SLO. |
| **Hive core** | Route + Zod + existing bus | Authenticated **operator** edge workers (or `HIVE_INTERNAL_TOKEN`) republish on the **same** bus as system events. |

## Machine contracts

- Registry: [`openapi/registry-v1.yaml`](./openapi/registry-v1.yaml), [`schemas/hive-registry-record-v1.schema.json`](./schemas/hive-registry-record-v1.schema.json)
- Gateway: [`openapi/gateway-v1.yaml`](./openapi/gateway-v1.yaml)
- Bridge: [`openapi/transport-bridge-v1.yaml`](./openapi/transport-bridge-v1.yaml), [`schemas/wan-envelope-v1.schema.json`](./schemas/wan-envelope-v1.schema.json)
- Internal ingress: [`openapi/mesh-wan-ingress-v1.yaml`](./openapi/mesh-wan-ingress-v1.yaml)

## What remains "out of product" (next waves)

- **Production** registry: write quotas / rate limit, audit, multi-tenant, **registrar SLA** (Bearer write + optional Postgres is a foundation, not a complete registrar product).
- Production gateway: TLS termination, WAF, distributed quotas, mTLS to Hive.
- Multi-region NATS topology, named durable consumers, DLQ.
- Business consumers on `mesh.wan.envelope`: Redis publish; reference **`npm run mesh:wan-worker`** (JSON line to stdout or Bearer webhook) — additional business logic in other subscribers or integrations.

## Quick start

- **Install Hive core first:** [`GETTING_STARTED.md`](./GETTING_STARTED.md)
- Local planetary stack: [`MESH_PLANETARY_DEV_STACK.md`](./MESH_PLANETARY_DEV_STACK.md)
- Doc ↔ code map: [`MESH_PLANETARY_TRACE.md`](./MESH_PLANETARY_TRACE.md)
- **Déploiement WAN assemblé** (ordre, secrets, vérifs): [`MESH_WAN_COMPLETE_DEPLOYMENT.md`](./MESH_WAN_COMPLETE_DEPLOYMENT.md)
- **V1 adoption** (risks, go-live checklist, minimal runbook): [`MESH_PLANETARY_V1_ADOPTION.md`](./MESH_PLANETARY_V1_ADOPTION.md)
- **Stub contract changelog** (semver for integrators): [`MESH_PLANETARY_CHANGELOG.md`](./MESH_PLANETARY_CHANGELOG.md)
