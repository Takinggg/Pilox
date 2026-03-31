# hive-transport-bridge (Helm)

Deploy the **P3 transport bridge** (`POST /v1/publish` → optional NATS) and optionally the **NATS subscriber** that forwards to Hive **`POST /api/mesh/wan/ingress`**.

Product docs: [`docs/MESH_PLANETARY_P3_TRANSPORT.md`](../../docs/MESH_PLANETARY_P3_TRANSPORT.md), OpenAPI [`docs/openapi/transport-bridge-v1.yaml`](../../docs/openapi/transport-bridge-v1.yaml).

## Image

From the repository root:

```bash
docker build -f services/transport-bridge/Dockerfile -t hive-transport-bridge:local .
```

## Install (bridge only)

```bash
helm upgrade --install mesh-bridge ./deploy/helm/hive-transport-bridge \
  --set bridge.image.repository=your-registry/hive-transport-bridge \
  --set bridge.image.tag=0.1.0 \
  --set bridge.natsUrl=nats://nats:4222 \
  --set bridge.internalSecret="$(openssl rand -base64 48)"
```

`BRIDGE_INTERNAL_SECRET` is **required** for a sensible security posture whenever `BRIDGE_NATS_URL` is set (see server warning). The chart creates a Kubernetes `Secret` when you set `bridge.internalSecret`; or set `bridge.internalSecretExistingSecret` + `internalSecretExistingKey` to use your own.

## Subscriber (optional)

Enable a second `Deployment` that runs `node src/subscriber.mjs`:

```yaml
# values override fragment
subscriber:
  enabled: true
  natsUrl: nats://nats:4222
  hiveWanIngestUrl: http://hive-app:3000/api/mesh/wan/ingress
  hiveWanIngestTokenExistingSecret: hive-internal
  hiveWanIngestTokenExistingKey: HIVE_INTERNAL_TOKEN
```

Align the token value with Hive **`HIVE_INTERNAL_TOKEN`**.

**JetStream:** create a stream that covers `hive.mesh.wan` (or your `BRIDGE_NATS_SUBJECT`) before expecting durable delivery — see [`docs/deploy/nats-jetstream-hive-mesh-wan.example.md`](../../docs/deploy/nats-jetstream-hive-mesh-wan.example.md).

**HTTP TLS / mTLS:** the bridge listens on plain HTTP inside the pod; terminate TLS (and optional client auth) at Ingress or mesh — see [`docs/deploy/edge-tls-mesh-services.md`](../../docs/deploy/edge-tls-mesh-services.md).

**Ingress (optional):** enable `bridge.ingress` (same shape as [`hive-registry`](../hive-registry/README.md)) to expose **`/v1/publish`** and **`/v1/health`** on your edge.

```yaml
bridge:
  ingress:
    enabled: true
    className: nginx
    hosts:
      - host: bridge.prod.example.com
        paths:
          - path: /
            pathType: Prefix
    tls:
      - secretName: bridge-tls
        hosts:
          - bridge.prod.example.com
```

**NATS TLS / mTLS:** mount PEM material from a Kubernetes `Secret` and set file paths via env (implemented in `services/transport-bridge/src/nats-connect.mjs`). Example values:

```yaml
bridge:
  natsUrl: tls://nats.nats.svc.cluster.local:4222   # or nats:// — see NATS server config
  natsTls:
    enabled: true
    secretName: hive-bridge-nats-tls
    mountPath: /etc/nats-tls
    caFilename: ca.crt           # trust NATS server (required for private CAs)
    certFilename: client.crt     # optional: client cert for NATS mTLS
    keyFilename: client.key
    # insecureSkipVerify: true  # lab only — sets *_NATS_TLS_REJECT_UNAUTHORIZED=0
subscriber:
  natsTls:                       # same shape; maps to SUBSCRIBER_* env vars
    enabled: true
    secretName: hive-subscriber-nats-tls
    caFilename: ca.crt
```

Details: [`docs/deploy/nats-jetstream-hive-mesh-wan.example.md`](../../docs/deploy/nats-jetstream-hive-mesh-wan.example.md) § TLS.

## Values reference

| `values.yaml` | Purpose |
|---------------|---------|
| `bridge.natsUrl` | `BRIDGE_NATS_URL` (empty = bridge accepts publishes but NATS is a no-op) |
| `bridge.natsTls.*` | Optional Secret mount → `BRIDGE_NATS_TLS*` env (TLS / mTLS toward NATS) |
| `bridge.ingress.*` | Optional HTTP Ingress → bridge `Service` (TLS at edge) |
| `bridge.internalSecret` | Creates `Secret` …`-bridge-internal`; omit if using `internalSecretExistingSecret` |
| `bridge.podLabels` | e.g. `cluster` / `region` for multi-site metrics |
| `bridge.metricsAuthSecret` | Optional Bearer for `GET /v1/metrics` → Secret `…-bridge-metrics` |
| `subscriber.enabled` | Second deployment for `subscriber.mjs` |
| `subscriber.natsTls.*` | Same for subscriber (`SUBSCRIBER_NATS_TLS*`) |
| `subscriber.hiveWanIngestTokenExistingSecret` | Preferred over inline token |

## In-cluster smoke (Job)

You can run [`p3-nats-smoke.mjs`](../../services/transport-bridge/scripts/p3-nats-smoke.mjs) from a **Job** or **CronJob** using the same image (scripts are in the Dockerfile). Examples under [`deploy/kubernetes/`](../../kubernetes/README.md): Jobs (**JetStream** / **core**), CronJobs (**JetStream** / **core**) — see the table in that README.

## Probes

- **Bridge:** HTTP `GET /v1/health` on port 4081.
- **Subscriber:** no HTTP port — no probes (restarts on crash only). Add a sidecar or custom probe in your fork if needed.
