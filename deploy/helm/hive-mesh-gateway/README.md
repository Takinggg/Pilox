# hive-mesh-gateway (Helm)

Minimal chart to deploy the **P2 gateway stub** (`services/gateway`) in Kubernetes.

## Image

Build from the repository root:

```bash
docker build -f services/gateway/Dockerfile -t hive-mesh-gateway:local .
```

Then load the image into your cluster (kind, k3s, etc.) or push to a registry and update `values.yaml` (`image.repository`, `image.tag`).

## Install

```bash
helm upgrade --install mesh-gw ./deploy/helm/hive-mesh-gateway \
  --set gateway.upstreamBase=http://your-hive:3000 \
  --set gateway.upstreamAuthSecret=YOUR_MESH_GATEWAY_INBOUND_SECRET
```

`GATEWAY_UPSTREAM_AUTH_SECRET` on the pod side corresponds to the Hive secret **`MESH_GATEWAY_INBOUND_SECRET`** (Bearer `X-Hive-Gateway-Auth`).

## Useful values

| `values.yaml` | Stub variable |
|---------------|----------------|
| `gateway.upstreamBase` | `GATEWAY_UPSTREAM_BASE` |
| `gateway.jsonrpcPath` | `GATEWAY_JSONRPC_PATH` |
| `gateway.upstreamAuthSecret` | `GATEWAY_UPSTREAM_AUTH_SECRET` |
| `gateway.rateLimitPerMin` | `GATEWAY_RATE_LIMIT_PER_MIN` |
| `gateway.rateLimitRedisUrl` | `GATEWAY_RATE_LIMIT_REDIS_URL` — shared RL across replicas |
| `gateway.maxBodyBytes` | `GATEWAY_MAX_BODY_BYTES` |
| `gateway.upstreamForwardFor` | `GATEWAY_UPSTREAM_FORWARD_FOR` (`off` / `socket` / `chain`) |
| `gateway.upstreamTimeoutMs` | `GATEWAY_UPSTREAM_TIMEOUT_MS` (0 = disabled on the chart side; chart default 60000) |
| `gateway.blockUserAgents` | `GATEWAY_BLOCK_USER_AGENTS` — comma-separated substrings; **403** on JSON-RPC if `User-Agent` matches |
| `gateway.tlsCertPath` / `tlsKeyPath` | PEM paths inside the container (mount a `Secret` / volume) → `GATEWAY_TLS_*` |
| `gateway.mtlsCaPath` | Client CA for mTLS → `GATEWAY_MTLS_CA_PATH` |
| `gateway.securityHeaders` | `GATEWAY_SECURITY_HEADERS` (`0` / `1`) |
| `gateway.metricsAuthSecret` | Creates a `Secret` and sets `GATEWAY_METRICS_AUTH_SECRET` (Bearer for `/v1/metrics`) |
| `gateway.maxUrlBytes` | `GATEWAY_MAX_URL_BYTES` (DoS limit on request line) |
| `gateway.requestTimeoutMs` | `GATEWAY_REQUEST_TIMEOUT_MS` (incoming socket timeout; `0` = Node default) |
| `autoscaling` | HPA (CPU) when `enabled: true`; `minReplicas` / `maxReplicas` |
| `podDisruptionBudget` | PDB when `enabled: true` (`minAvailable`) |
| `serviceMonitor.enabled` (+ `interval`, `path`, …) | Creates a **ServiceMonitor** (Prometheus Operator) for `/v1/metrics` |
| `prometheusRule.enabled` (+ `for`, `labels`) | Creates a **PrometheusRule** (alert on gateway 5xx rate) |
| `podLabels` | Optional `cluster` / `region` (or any) labels on the **pod** template for Prometheus multi-site SLO — see [`docs/observability/MULTI_REGION_SLO_RUNBOOK.md`](../../docs/observability/MULTI_REGION_SLO_RUNBOOK.md) |

### Ingress TLS (optional)

In `values.yaml`, set `ingress.enabled: true`, fill in `ingress.hosts` and `ingress.tls` (cert-manager or manual secret). The chart references the same `Service` on `service.port`.

**Example comments** for WAF / ModSecurity (nginx) or WAFv2 ACL (ALB) are in `values.yaml` under `ingress` — uncomment according to your provider.

**Managed WAF (typical patterns)** — apply at the **edge** in front of this chart’s Ingress; the gateway pod stays unchanged:

| Provider | Pattern |
|----------|---------|
| **Cloudflare** | Orange-cloud DNS + WAF rules / OWASP managed ruleset on the proxied hostname; origin = your Ingress LB IP or tunnel. |
| **AWS** | Associate **WAFv2** web ACL with **ALB** or **API Gateway** in front of the cluster; use the annotation in `values.yaml` when using AWS Load Balancer Controller. |
| **Azure** | **Front Door** or **Application Gateway WAF** in front of AKS Ingress; tune OWASP / bot rules there. |
| **GCP** | **Cloud Armor** policy on the HTTPS load balancer backend service. |

For **nginx** ingress with **ModSecurity**, prefer the commented keys in `values.yaml` in a **non-prod** canary first (latency + false positives).

### Metrics & SLO

- **`GET /v1/metrics`** (Prometheus text).
- Set **`serviceMonitor.enabled: true`** to install a **ServiceMonitor** (kube-prometheus-stack / Prometheus Operator).
- Set **`prometheusRule.enabled: true`** for a starter alert on **HTTP 5xx** rate (tune `prometheusRule.for` and the expr in the template for your SLO).

See also [`docs/MESH_PLANETARY_P2_WAN_GATEWAY.md`](../../docs/MESH_PLANETARY_P2_WAN_GATEWAY.md) and [`docs/MESH_PLANETARY_DEV_STACK.md`](../../docs/MESH_PLANETARY_DEV_STACK.md).
