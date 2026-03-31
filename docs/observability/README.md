# Observability — Hive mesh (Prometheus, Tempo, native UI)

Hive’s **default** path is: **OpenTelemetry** → collector → **Prometheus** + **Tempo**, plus the built-in **`/observability`** page (admin) for charts and trace inspection. **Grafana is not part of the Docker stacks** in this repository; use **Prometheus UI** (graphs, **Alerts**), **Alertmanager** for notifications, and Hive’s APIs (`/api/observability/*`) as documented below.

## Native Hive UI (`/observability`)

- **Recharts** graphs via allowlisted PromQL presets; **Tempo** trace list + detail (waterfall / JSON).
- Server env: **`PROMETHEUS_OBSERVABILITY_URL`**, **`TEMPO_OBSERVABILITY_URL`** (reachable from the Hive process, e.g. `http://prometheus:9090` on the Docker network).
- Trace filter uses **`service.name`** = **`OTEL_SERVICE_NAME`** (default `hive`).
- APIs: **`/api/observability/prometheus`**, **`/api/observability/tempo/search`**, **`/api/observability/tempo/trace/[id]`** — no arbitrary client-side PromQL/TraceQL.

## Full local stack (Docker `otel` profile)

From **`app/`** ([`docker-compose.yml`](../../app/docker-compose.yml)):

```bash
docker compose --profile otel up -d
# or: npm run mesh:otel
```

| Service | Role | Host port |
|---------|------|-----------|
| **tempo** | Trace storage (internal OTLP) | **3200** (HTTP API) |
| **otel-collector** | OTLP in, spanmetrics, export to Tempo + Prometheus exporter | **4318** OTLP HTTP, **8889** metrics, **13133** health |
| **prometheus** | Scrapes the collector; forwards firing alerts to Alertmanager | **9090** |
| **alertmanager** | Notification routing ([`alertmanager.yml`](./alertmanager.yml)) | **9093** |

Configs: [`otel-collector-docker.local.yaml`](./otel-collector-docker.local.yaml), [`tempo-local.yaml`](./tempo-local.yaml), [`prometheus-otel-local.yml`](./prometheus-otel-local.yml).

Hive **on the host**: **`OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`** ([`app/.env.example`](../../app/.env.example)).

**Security**: do not expose **4318**, **8889**, **9090**, **9093**, **3200** to the Internet without auth; use a private network for operator tools.

### Prometheus alerts

Rules: [`prometheus-rules.hive.yml`](./prometheus-rules.hive.yml). Details: [`ALERTING.md`](./ALERTING.md). In Prometheus: **Alerts** tab.

SLO-style recording rules (optional): [`prometheus-slo-mesh.example.yml`](./prometheus-slo-mesh.example.yml) — not wired in compose by default.

Without the `otel` profile, Postgres / Redis / Traefik remain unchanged.

### Collector only (no Tempo / no local Prometheus)

Use [**otel-collector-spanmetrics.example.yaml**](./otel-collector-spanmetrics.example.yaml) — add a trace exporter if you send spans elsewhere.

## Production Docker (`observability` profile)

[`docker/docker-compose.prod.yml`](../docker/docker-compose.prod.yml) — profile **`observability`**: **Tempo**, **Prometheus**, **OpenTelemetry Collector** (same idea as local; **no Grafana**). Hive **`hive-app`** should set **`OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318`** and, for **`/observability`**, **`PROMETHEUS_OBSERVABILITY_URL`**, **`TEMPO_OBSERVABILITY_URL`**. See [PRODUCTION.md](../PRODUCTION.md) §9.

## Legacy Grafana dashboard JSON (optional, not shipped)

The files [`grafana-dashboard-hive-mesh.json`](./grafana-dashboard-hive-mesh.json) and [`grafana/provisioning/`](./grafana/provisioning/) are **not** mounted or used by Hive compose. They exist only as a **reference** if you choose to run a third-party dashboard tool yourself; that product’s license (e.g. Grafana AGPL) applies to **your** deployment, not to Hive’s default stack.

## Metric names (OTLP → Prometheus)

The **exact** names depend on the collector (OTel Collector `prometheus` exporter, Alloy, Mimir OTLP, etc.):

- Often **dots** in OTel names become **underscores**: `hive.mesh.a2a.rpc.duration_ms` → `hive_mesh_a2a_rpc_duration_ms` (+ `_bucket` / `_sum` / `_count` for classic histograms).
- **Attributes** become **labels**; keys with `.` may normalize to `_`.

If you import the legacy JSON into another tool, adjust **variables** (`rpc_histogram_basename`, `blocked_counter`) to match metrics in **Prometheus → Graph** or your preset queries.

## Reference queries (adapt as needed)

**P99 RPC latency** (classic histogram):

```promql
histogram_quantile(
  0.99,
  sum(rate(${rpc_histogram_basename}_bucket[5m])) by (le)
)
```

**Rate limit rejections / 5 min**:

```promql
sum by (mesh_rate_limit_tier) (rate(${blocked_counter}[5m]))
```

**Saturation** — histogram `hive.mesh.rate_limit.window_utilization_ratio`:

```promql
histogram_quantile(
  0.95,
  sum(rate(${utilization_histogram_basename}_bucket[5m])) by (le)
)
```

## HTTP traces (`hive.http`)

API handlers use **`withHttpServerSpan`** (`app/src/lib/otel-http-route.ts`): server span **`http.server`**, tracer **`hive.http`**.

| OTel attribute | Role |
|----------------|------|
| `http.route` | Stable label (e.g. `GET /api/health`) — preferred for grouping |
| `http.request.method` | HTTP verb |
| `http.response.status_code` | Status |
| `url.path` | Actual path |

**Tempo** (or any OTLP-compatible backend): filter by `resource.service.name` / `OTEL_SERVICE_NAME` (`hive`), span name `http.server`, attribute `http.route`.

Example **TraceQL** (engine-dependent):

```traceql
{ resource.service.name = "hive" && name = "http.server" && http.route = "GET /api/health" }
```

**P99 per HTTP route** in PromQL usually needs **spanmetrics** on the collector ([`otel-collector-spanmetrics.example.yaml`](./otel-collector-spanmetrics.example.yaml), namespace e.g. `hive_span`).

## Correlation with traces

Hive reads **`traceparent`** (W3C) on A2A JSON-RPC and HTTP routes wrapped with **`withHttpServerSpan`**. Details: [`MESH_OBSERVABILITY.md`](../MESH_OBSERVABILITY.md).

Deployment checklist: [`PRE_PUBLIC_BETA_CHECKLIST.md`](../PRE_PUBLIC_BETA_CHECKLIST.md).
