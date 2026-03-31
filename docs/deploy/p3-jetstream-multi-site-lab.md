# P3 — JetStream multi-site lab (operator)

**Status:** lab / design validation — not a single shipped topology. Use this to rehearse **cross-site** WAN delivery before production SLOs.

**Scope:** NATS **JetStream** as the bus between regions (see [`MESH_PLANETARY_P3_TRANSPORT.md`](../MESH_PLANETARY_P3_TRANSPORT.md)). The repo CI only proves **one** JetStream server + stream + bridge publish (see `planetary-stubs`); multi-site wiring is **your** cluster / vendor config.

---

## What you are proving

1. A **wan-envelope-v1** published at **site A** (bridge → NATS) appears at **site B** (subscriber or consumer) within an agreed latency budget.
2. **Stream lag** and **consumer ack** behavior are observable (metrics or `nats` CLI).
3. **Broker or partition** between sites degrades predictably (no silent “success” on the HTTP publish path while messages are stuck — bridge may return **202** while JetStream is local; cross-site delay is operational).

---

## Topology patterns (choose one)

| Pattern | Idea | Hive fit |
|---------|------|----------|
| **Hub JetStream + leaf nodes** | Each site runs a leaf attached to a central cluster; subjects/stream semantics follow NATS leaf docs | Bridge publishes to a subject that resolves in the hub stream; subscriber at another site consumes via leaf |
| **Stream sources / mirrors** | One “golden” stream; other clusters mirror or aggregate | Align stream names (`HIVE_MESH_WAN`) and subjects (`hive.mesh.wan`) across definitions |
| **Single stretched cluster** | One RAFT group across DCs | Usually **not** recommended for WAN latency; document if you accept RTO/RPO tradeoffs |

Official NATS material: multi-site, super-cluster, and leaf nodes — start from [NATS JetStream clustering](https://docs.nats.io/running-a-nats-service/configuration/jetstream_clustering) and your distribution’s runbooks.

---

## Minimal lab checklist (two footprints)

1. **Two** NATS JetStream–enabled endpoints that can exchange traffic (VPN, private link, or approved leaf/hub topology).
2. On each side, define a stream that **covers** `hive.mesh.wan` (or your override of `BRIDGE_NATS_SUBJECT`) — same semantics as [`nats-jetstream-hive-mesh-wan.example.md`](./nats-jetstream-hive-mesh-wan.example.md).
3. Deploy **bridge** at site A (or use `curl` to an existing bridge) with `BRIDGE_NATS_URL` pointing at **local** NATS (leaf or hub listener).
4. Deploy **subscriber** at site B with `SUBSCRIBER_NATS_URL` / `BRIDGE_NATS_URL` toward **its** NATS, same subject/mode/JetStream stream visibility.
5. Run the **staging** correlation flow: [`p3-multi-region-synthetic-check.md`](./p3-multi-region-synthetic-check.md).

---

## SLO-oriented probes

- **End-to-end latency:** timestamp at `POST /v1/publish` vs subscriber log / Hive ingress log (same `correlationId`).
- **JetStream:** stream **lag**, consumer **num_pending** / **num_ack_pending** (`nats consumer info`, HTTP monitoring, or Prometheus exporter if you run one).
- **Error budgets:** align with [`MULTI_REGION_SLO_RUNBOOK.md`](../observability/MULTI_REGION_SLO_RUNBOOK.md) — treat sustained lag or DLQ growth as burn.

---

## TLS

If NATS spans untrusted networks, use **TLS/mTLS** on the broker path and bridge/subscriber **`BRIDGE_NATS_TLS*`** / **`SUBSCRIBER_NATS_TLS*`** (see [§ TLS in the stream example](./nats-jetstream-hive-mesh-wan.example.md)).

---

## References

- [`p3-wan-backpressure.md`](./p3-wan-backpressure.md)
- [`edge-tls-mesh-services.md`](./edge-tls-mesh-services.md)
- [`MESH_WORLD_NETWORK_EPIC.md`](../MESH_WORLD_NETWORK_EPIC.md)
