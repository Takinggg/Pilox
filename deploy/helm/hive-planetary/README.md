# hive-planetary (Helm umbrella)

Optional **single release** that installs:

- [`hive-registry`](../hive-registry/README.md) (P1)
- [`hive-mesh-gateway`](../hive-mesh-gateway/README.md) (P2)
- [`hive-transport-bridge`](../hive-transport-bridge/README.md) (P3)

**NATS / JetStream** is **not** included — point `hive-transport-bridge.bridge.natsUrl` at your broker.

## Prerequisite

From this directory, vendor subcharts once (creates `charts/*.tgz`, gitignored):

```bash
helm dependency build .
```

CI runs this before `helm template`. For local `helm template` / `helm install`, run `helm dependency build` after cloning.

## Install (example)

```bash
cd deploy/helm/hive-planetary
helm dependency build
helm upgrade --install planetary . \
  --namespace hive-mesh \
  --create-namespace \
  --set hive-registry.envFrom[0].secretRef.name=hive-registry-env \
  --set hive-mesh-gateway.gateway.upstreamBase=http://hive-app:3000 \
  --set hive-mesh-gateway.gateway.upstreamAuthSecret="$(openssl rand -base64 32)" \
  --set hive-transport-bridge.bridge.natsUrl=nats://nats.nats.svc.cluster.local:4222 \
  --set hive-transport-bridge.bridge.internalSecret="$(openssl rand -base64 48)"
```

Disable components:

```bash
helm upgrade --install planetary . --set registry.enabled=false
```

## Values

| Key | Purpose |
|-----|---------|
| `registry.enabled` | Install P1 registry subchart |
| `gateway.enabled` | Install P2 gateway subchart |
| `transportBridge.enabled` | Install P3 bridge (+ optional subscriber via `hive-transport-bridge.subscriber`) |
| `hive-registry` | Passed through to registry chart |
| `hive-mesh-gateway` | Passed through to gateway chart |
| `hive-transport-bridge` | Passed through to transport-bridge chart |

## See also

- [`docs/MESH_WAN_COMPLETE_DEPLOYMENT.md`](../../docs/MESH_WAN_COMPLETE_DEPLOYMENT.md) — order, secrets, TLS
- [`deploy/helm/README.md`](../README.md) — chart index
