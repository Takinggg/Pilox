# P3 — synthetic multi-region check (staging)

**Goal:** prove that a **wan-envelope-v1** published at **site A** reaches Hive’s WAN path at **site B** (subscriber → `POST /api/mesh/wan/ingress` → Redis `mesh.wan.envelope`), with a stable **`correlationId`** in logs.

This is a **manual / staging** procedure; automate later with your observability stack (metrics, log queries, or a small cron Job).

**Loopback (bridge → NATS only, no Hive):** CI runs `npm run smoke:p3-nats` twice in `services/transport-bridge` — **core** and **JetStream** (stream `HIVE_MESH_WAN` via `natsio/nats-box`). See [`scripts/p3-nats-smoke.mjs`](../../services/transport-bridge/scripts/p3-nats-smoke.mjs) and `.github/workflows/ci.yml` (`planetary-stubs`).

## Topology (minimal)

| Site | Components |
|------|------------|
| **A** | P2 gateway or curl → **transport bridge** → NATS JetStream (hub or leaf) |
| **B** | **NATS subscriber** → Hive app **`/api/mesh/wan/ingress`** → Redis |

NATS must run with a stream covering the publish subject (default **`hive.mesh.wan`**). Cross-site links: VPN, private networking, or approved leaf/super-cluster — see [`p3-jetstream-multi-site-lab.md`](./p3-jetstream-multi-site-lab.md) for lab patterns.

## Preconditions

- `HIVE_INTERNAL_TOKEN` set on Hive **B**; subscriber `HIVE_WAN_INGEST_TOKEN` matches.
- JetStream stream exists — [`nats-jetstream-hive-mesh-wan.example.md`](./nats-jetstream-hive-mesh-wan.example.md).
- Optional: TLS to NATS — same doc § TLS.

## Steps

1. **Pick** a unique `correlationId` (≥ 8 characters, e.g. a UUID without hyphens trimmed or full UUID).
2. **Publish** from site A a valid envelope (required fields: `v`, `correlationId`, `sourceOrigin` — see [`wan-envelope-v1`](../../docs/schemas/wan-envelope-v1.schema.json)) to the bridge:

   ```bash
   CID="$(uuidgen)"   # or openssl rand -hex 16  (≥ 8 chars)
   curl -sS -X POST "https://bridge-a.example/v1/publish" \
     -H "Authorization: Bearer $BRIDGE_INTERNAL_SECRET" \
     -H "Content-Type: application/json" \
     -H "traceparent: 00-$(openssl rand -hex 16)-01" \
     -d "{\"v\":1,\"correlationId\":\"$CID\",\"sourceOrigin\":\"https://hive-a.example/\",\"targetOrigin\":\"https://hive-b.example/\",\"payload\":{}}"
   ```

3. **Site B — subscriber logs:** expect a line containing `correlationId=<your CID>`.
4. **Site B — Hive:** confirm `POST /api/mesh/wan/ingress` **200** in access logs (or your tracing backend).
5. **Site B — Redis:** optional — subscribe or `MONITOR` (lab only) and look for channel traffic on `hive:system:events` carrying **`mesh.wan.envelope`** with the same `correlationId` inside the payload (exact shape depends on app serialization).

## Optional: in-cluster automation

For a **loopback** check inside Kubernetes (bridge Service + NATS, no cross-site), use the example manifests in [`deploy/kubernetes/README.md`](../../deploy/kubernetes/README.md) (**Job** JetStream or **core**, optional **CronJob**).

## Pass / fail

- **Pass:** steps 3–4 succeed within an agreed SLO (e.g. &lt; 30 s) and `correlationId` matches end-to-end.
- **Fail:** subscriber **nak** loop, ingest **401**, or missing Redis fan-out — capture NATS stream lag, DLQ subject hits (`HIVE_WAN_INGEST_DLQ_SUBJECT`), and bridge rate limits.

## References

- [`MESH_PLANETARY_P3_TRANSPORT.md`](../MESH_PLANETARY_P3_TRANSPORT.md)
- [`MESH_PLANETARY_TRACE.md`](../MESH_PLANETARY_TRACE.md)
- [`deploy/helm/hive-transport-bridge/README.md`](../../deploy/helm/hive-transport-bridge/README.md)
