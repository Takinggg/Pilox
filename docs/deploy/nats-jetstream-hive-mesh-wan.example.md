# NATS JetStream — example stream for `hive.mesh.wan`

**Context:** [`services/transport-bridge`](../services/transport-bridge/README.md) defaults to **`BRIDGE_NATS_MODE=jetstream`**. JetStream requires a **stream** whose subjects cover the publish subject (default **`hive.mesh.wan`**).

This file is an **operator example** for production tuning. **CI** creates the same stream shape when running the **JetStream** smoke in `planetary-stubs` (see `services/transport-bridge/scripts/p3-nats-smoke.mjs`). For **multi-site** rehearsal, see [`p3-jetstream-multi-site-lab.md`](./p3-jetstream-multi-site-lab.md).

---

## Prereqs

- NATS server with JetStream enabled (`-js` or config `jetstream: {}`).
- [`nats` CLI](https://github.com/nats-io/natscli) logged in (`nats context`) **or** use the HTTP management API.

---

## Option A — `nats` CLI (interactive)

```bash
nats stream add HIVE_MESH_WAN \
  --subjects "hive.mesh.wan" \
  --storage file \
  --retention limits \
  --max-msgs=-1 \
  --max-bytes=-1 \
  --discard old \
  --dupe-window 2m \
  --replicas 1
```

Tune **`--replicas`** for HA clusters. Cross-site: [`p3-jetstream-multi-site-lab.md`](./p3-jetstream-multi-site-lab.md) + NATS vendor docs (leaf nodes, super-cluster, mirrors).

---

## Option B — declarative JSON (bulk apply)

Save as `hive-mesh-wan-stream.json` (example skeleton):

```json
{
  "name": "HIVE_MESH_WAN",
  "subjects": ["hive.mesh.wan"],
  "storage": "file",
  "retention": "limits",
  "max_consumers": -1,
  "max_msgs": -1,
  "max_bytes": -1,
  "discard": "old",
  "duplicate_window": 120000000000
}
```

Apply with your platform’s JetStream config loader or `nats stream add` from file (see `nats stream add --config` in your CLI version).

---

## Consumer (subscriber)

The reference subscriber uses a JetStream **pull** or **push** subscription depending on `subscriber.mjs` (push subscription on subject). Ensure:

- **Max ack pending** and **ack wait** suit Hive ingest latency (`POST /api/mesh/wan/ingress`).
- **Max deliveries** is finite so poison messages do not loop forever; pair with **`HIVE_WAN_INGEST_DLQ_SUBJECT`** if configured.

---

## Verification

1. `curl` bridge health: `GET http://<bridge>:4081/v1/health` → `nats.enabled` true when URL set.
2. `nats stream info HIVE_MESH_WAN`
3. Publish a valid **wan-envelope-v1** body to `POST /v1/publish` and confirm message count increases.

---

## TLS / mTLS (NATS client)

The bridge and subscriber are **Node clients** to NATS. Configure TLS on **nats-server** (see [NATS TLS](https://docs.nats.io/running-a-nats-service/configuration/securing_nats/tls)), then point the bridge at the TLS listener and supply trust material:

| Goal | Typical env (bridge) |
|------|----------------------|
| Verify server with a private CA | `BRIDGE_NATS_TLS_CA_FILE=/path/to/ca.pem` |
| Require TLS (server uses public CA) | `BRIDGE_NATS_TLS=1` |
| mTLS (NATS verifies client cert) | `BRIDGE_NATS_TLS_CERT_FILE` + `BRIDGE_NATS_TLS_KEY_FILE` (+ usually `CA_FILE`) |

The **subscriber** honors `SUBSCRIBER_NATS_TLS*` first, then falls back to `BRIDGE_NATS_TLS*`. For **lab only**, `BRIDGE_NATS_TLS_REJECT_UNAUTHORIZED=0` disables server cert verification (never in production).

**Helm:** `bridge.natsTls` / `subscriber.natsTls` mount a Secret and set the `*_FILE` paths — [`deploy/helm/hive-transport-bridge/README.md`](../../deploy/helm/hive-transport-bridge/README.md).

**HTTP edge** (Ingress toward the bridge) is separate from NATS TLS — [`edge-tls-mesh-services.md`](./edge-tls-mesh-services.md).

---

## References

- [`MESH_PLANETARY_P3_TRANSPORT.md`](../MESH_PLANETARY_P3_TRANSPORT.md)
- [`MESH_PLANETARY_DEV_STACK.md`](../MESH_PLANETARY_DEV_STACK.md)
- [`p3-wan-backpressure.md`](./p3-wan-backpressure.md) — payload / queue limits
- [`p3-jetstream-multi-site-lab.md`](./p3-jetstream-multi-site-lab.md) — two-footprint lab
- [`deploy/helm/README.md`](../../deploy/helm/README.md) — chart index
- [`deploy/helm/hive-transport-bridge/README.md`](../../deploy/helm/hive-transport-bridge/README.md)
