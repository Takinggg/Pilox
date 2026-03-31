# Edge TLS / mTLS for mesh-related services

Hive planetary components are mostly **plain HTTP** inside the cluster. **Terminate TLS (and optional mTLS)** at the platform edge — Ingress, API gateway, Envoy, or a service mesh — rather than expecting each Node process to handle client certificates.

## Services in this repo

| Service | Default port | Notes |
|---------|--------------|--------|
| **P1 registry** | 4077 | Helm: [`deploy/helm/hive-registry/README.md`](../../deploy/helm/hive-registry/README.md) |
| **P3 transport bridge** | see chart | Helm: optional **`bridge.ingress`** (TLS at edge) — [`deploy/helm/hive-transport-bridge/README.md`](../../deploy/helm/hive-transport-bridge/README.md); process is HTTP-only |
| **P2 WAN gateway** | see chart | Helm: [`deploy/helm/hive-mesh-gateway/README.md`](../../deploy/helm/hive-mesh-gateway/README.md) |

## TLS (HTTPS) at Ingress

1. Create or reuse a TLS Secret (`tls.crt` / `tls.key`) or use cert-manager.
2. Enable Ingress in chart values (`ingress` on **registry**; **`bridge.ingress`** on **transport-bridge**) and `ingress.tls` / `bridge.ingress.tls`, **or** front the ClusterIP Service with your own Ingress / Gateway resource.
3. Ensure the edge sets **`X-Forwarded-Proto: https`** and a trustworthy client IP chain so Hive rate limits and federation allowlists stay correct (see [`PRODUCTION.md`](../PRODUCTION.md) §4.1 and [`MESH_MTLS.md`](../MESH_MTLS.md) operator checklist).

## mTLS (client certificates)

Application code here does **not** verify client certificates. For **mutual** TLS, configure your Ingress controller or mesh with `tls.clientAuth` / equivalent, and keep using application-layer controls (e.g. federation JWT, `REGISTRY_WRITE_SECRET`, bridge `internalSecret`) as defined in each service.

Conceptual split: [`MESH_MTLS.md`](../MESH_MTLS.md) — transport mTLS vs application JWT.

## NATS / JetStream (client TLS)

The transport bridge sets up TLS using **`BRIDGE_NATS_TLS`**, **`BRIDGE_NATS_TLS_CA_FILE`**, **`BRIDGE_NATS_TLS_CERT_FILE`**, **`BRIDGE_NATS_TLS_KEY_FILE`** (subscriber: **`SUBSCRIBER_NATS_TLS*`** with fallback to bridge). See [`nats-jetstream-hive-mesh-wan.example.md`](./nats-jetstream-hive-mesh-wan.example.md) § TLS and the service README in [`services/transport-bridge/README.md`](../../services/transport-bridge/README.md).

The **`BRIDGE_NATS_URL`** scheme depends on your NATS listener (`nats://` vs `tls://`); the nats.js client upgrades when the server advertises TLS or when you pass a `tls` options object (which these env vars build).
