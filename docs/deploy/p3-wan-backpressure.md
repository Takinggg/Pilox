# P3 — WAN back-pressure and payload limits

**Context:** the transport path is **bridge → NATS → subscriber → Hive `POST /api/mesh/wan/ingress` → Redis**. Each hop has its own size and queue semantics; operators should align them so large or abusive payloads fail **early** and slow consumers do not silently pin unbounded memory.

## Reference limits (repository defaults)

| Layer | Control | Default / notes |
|-------|---------|-----------------|
| **Bridge HTTP** | `BRIDGE_MAX_BODY_BYTES` | `1048576` (1 MiB), hard cap `8 MiB` in code |
| **Bridge** | `BRIDGE_RATE_LIMIT_PER_MIN` | `0` = off — enable in shared networks |
| **NATS server** | `max_payload` | Server default (often **1 MiB**); must be ≥ largest envelope you allow |
| **JetStream** | stream `max_msg_size` / discard policy | Set per stream; see [NATS limits](https://docs.nats.io/nats-concepts/jetstream/streams) |
| **Hive ingress** | app middleware / body limits | Configure Next/edge to match bridge (avoid accepting 10 MiB if bridge allows 1 MiB) |
| **Redis** | `client-output-buffer-limit`, memory | Large pub/sub payloads stress subscribers; keep envelopes small |

## Policy recommendations

1. **Single cap:** pick a maximum **JSON envelope** size (e.g. 256 KiB–1 MiB), set **`BRIDGE_MAX_BODY_BYTES`** and **NATS `max_payload`** (and JetStream **`max_msg_size`**) to that value or slightly above for framing.
2. **Oversized payload:** bridge returns **413**; NATS may reject publish; document expected behavior in runbooks.
3. **Slow Hive ingest:** subscriber **nak** + JetStream **max deliveries** + optional **`HIVE_WAN_INGEST_DLQ_SUBJECT`** — see [`services/transport-bridge/README.md`](../../services/transport-bridge/README.md).
4. **Spill to object storage:** if product requires large blobs, keep **`payload`** as a **reference** (URL + hash + size) inside the envelope; move bytes out-of-band. Not implemented in-repo — product decision.

## References

- [`MESH_PLANETARY_P3_TRANSPORT.md`](../MESH_PLANETARY_P3_TRANSPORT.md) — non-decisions / follow-ups
- [`docs/deploy/nats-jetstream-hive-mesh-wan.example.md`](./nats-jetstream-hive-mesh-wan.example.md)
- [`docs/deploy/p3-jetstream-multi-site-lab.md`](./p3-jetstream-multi-site-lab.md)
- [`docs/deploy/p3-multi-region-synthetic-check.md`](./p3-multi-region-synthetic-check.md)
