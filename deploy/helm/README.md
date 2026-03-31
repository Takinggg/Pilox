# Helm charts (Hive mesh stubs)

Charts in this directory deploy **reference** services for the planetary / WAN mesh stack. They are validated in CI (`helm-template` job in `.github/workflows/ci.yml`). **Order, secrets, and verification** for a full stack: [`docs/MESH_WAN_COMPLETE_DEPLOYMENT.md`](../../docs/MESH_WAN_COMPLETE_DEPLOYMENT.md).

| Chart | Service | Port (default) | Role |
|-------|---------|----------------|------|
| [`hive-planetary`](./hive-planetary/README.md) | Umbrella (optional) | — | Single release: registry + gateway + transport-bridge (`helm dependency build` first) |
| [`hive-mesh-gateway`](./hive-mesh-gateway/README.md) | P2 gateway | 4080 | JSON-RPC proxy → Hive upstream |
| [`hive-transport-bridge`](./hive-transport-bridge/README.md) | P3 bridge (+ optional subscriber) | 4081 | `POST /v1/publish` → NATS; optional fan-in to Hive WAN ingress |
| [`hive-registry`](./hive-registry/README.md) | P1 registry | 4077 | HTTP registry API v1 |

## Quick render (local)

```bash
helm dependency build ./deploy/helm/hive-planetary
helm template planetary ./deploy/helm/hive-planetary \
  --set hive-mesh-gateway.gateway.upstreamAuthSecret=replace-with-32-plus-chars-minimum \
  --set hive-transport-bridge.bridge.internalSecret=replace-with-32-plus-chars-minimum \
  --set hive-transport-bridge.bridge.natsUrl=nats://nats:4222
helm template gw ./deploy/helm/hive-mesh-gateway
helm template tb ./deploy/helm/hive-transport-bridge \
  --set bridge.internalSecret=replace-with-32-plus-chars-minimum \
  --set bridge.natsUrl=nats://nats:4222
helm template reg ./deploy/helm/hive-registry
```

## Kubernetes examples (non-Helm)

See [`deploy/kubernetes/README.md`](../kubernetes/README.md) (e.g. P3 bridge **Job** smoke).

## Product / operator docs

- Transport & JetStream: [`docs/MESH_PLANETARY_P3_TRANSPORT.md`](../../docs/MESH_PLANETARY_P3_TRANSPORT.md), [`docs/deploy/nats-jetstream-hive-mesh-wan.example.md`](../../docs/deploy/nats-jetstream-hive-mesh-wan.example.md)
- TLS at the edge: [`docs/deploy/edge-tls-mesh-services.md`](../../docs/deploy/edge-tls-mesh-services.md)
- Multi-region SLO: [`docs/observability/MULTI_REGION_SLO_RUNBOOK.md`](../../docs/observability/MULTI_REGION_SLO_RUNBOOK.md)
