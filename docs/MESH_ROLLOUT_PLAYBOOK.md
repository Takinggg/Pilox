# Mesh / WAN rollout — feature flags, kill switch, exit criteria

**Status:** operational playbook.  
**Tracking:** GitHub issue [#7](https://github.com/Takinggg/Hive/issues/7), [`MESH_WORLD_NETWORK_EPIC.md`](./MESH_WORLD_NETWORK_EPIC.md).

Use this when enabling **federation**, **public A2A**, **gateway in front of Hive**, **WAN ingress / transport-bridge**, or **DHT bootstrap hints** in production.

---

## 1. Stages

| Stage | Scope | Goal |
|-------|--------|------|
| **Dev** | Single machine / compose | Correctness, unit + integration tests |
| **Staging** | One “fake” region | Load, TLS, Redis/NATS as in prod class |
| **Canary** | One production region or % traffic | Measure SLO burn, error rate |
| **Full** | All regions | Documented rollback tested |

---

## 2. Flags and knobs (reference)

Document **default**, **safe value**, and **blast radius** for each change. Below are **representative** env vars — your deployment may wrap them in Helm.

| Flag / variable | Default (typical) | Kill switch | Blast radius |
|-----------------|-------------------|-------------|--------------|
| `MESH_FEDERATION_ENABLED` | `false` | `false` | Inbound/outbound federation off |
| `A2A_ENABLED` | varies | `false` | Agent card / JSON-RPC off |
| `MESH_GATEWAY_INBOUND_SECRET` / gateway `GATEWAY_UPSTREAM_AUTH_SECRET` | empty | remove alignment → 401 | Gateway → Hive broken until fixed |
| `BRIDGE_NATS_URL` (transport-bridge) | empty | unset | No NATS publish (bridge no-op) |
| `HIVE_WAN_INGEST_URL` (subscriber) | empty | unset | No callback to Hive |
| `MESH_PUBLIC_DHT_BOOTSTRAP_URLS` | empty | empty | Descriptor drops DHT hints |
| `MESH_BUS_HMAC_SECRET` | empty | unset | Subscribers cannot verify `meshSig` only |

**Hive app:** `HIVE_SKIP_MIGRATE`, `HIVE_SKIP_MARKETPLACE_INDEX` — not mesh flags; do not use as mesh kill switch.

---

## 3. Exit criteria (before full rollout)

- **Error ratio:** gateway/registry HTTP success ratio within budget (see [`observability/MULTI_REGION_SLO_RUNBOOK.md`](./observability/MULTI_REGION_SLO_RUNBOOK.md)).
- **Latency:** p95 upstream (Hive) stable vs baseline.
- **Auth:** no spike in **401/403** from misconfigured secrets.
- **Redis/NATS:** no sustained consumer lag or DLQ growth without runbook owner.

---

## 4. Rollback

1. Set **kill switch** env to safe value (table above).  
2. **Redeploy** or reload pods (immutable infra).  
3. **Drain** optional: stop bridge subscriber / gateway last to avoid partial client retries storm.  
4. **Revert** GitOps commit if change was values-only.  
5. **Post-incident:** record `correlationId` / trace IDs from [`MESH_PLANETARY_TRACE.md`](./MESH_PLANETARY_TRACE.md) tooling.

---

## 5. References

- [`PRODUCTION.md`](./PRODUCTION.md) — TLS, client IP, egress SSRF  
- [`MESH_FEDERATION_RUNBOOK.md`](./MESH_FEDERATION_RUNBOOK.md)  
- [`MESH_PLANETARY_P3_TRANSPORT.md`](./MESH_PLANETARY_P3_TRANSPORT.md)  
- [`observability/MULTI_REGION_SLO_RUNBOOK.md`](./observability/MULTI_REGION_SLO_RUNBOOK.md)
