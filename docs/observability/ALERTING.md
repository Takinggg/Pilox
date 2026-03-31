# Alerting — Prometheus (Hive)



## File



[`prometheus-rules.hive.yml`](./prometheus-rules.hive.yml) is loaded by [`prometheus-otel-local.yml`](./prometheus-otel-local.yml) in the Docker **`otel`** profile (`app/docker-compose.yml`).



## Defined alerts (summary)



| Alert | Purpose |

|-------|---------|

| `HiveHttpP99LatencyHigh` | P99 spanmetrics HTTP > 5 s for 10 min |

| `HiveHttp5xxSpike` | 5xx span throughput > 0.2/s for 5 min |

| `HiveMeshRateLimitBlockedElevated` | Mesh rate-limit rejections > 0.5/s on average |

| `HiveMeshA2aRpcP99High` | P99 A2A RPC histogram > 10 s |



The **metric names** and **thresholds** must match what Prometheus actually scrapes (**Status → Targets**, then **Graph** / **Alerts**). Copy the file to prod and adjust.



## SLO-style recordings (optional)



For **error-budget** or ratio panels on the **P1 registry** / **P2 gateway** stubs (`hive_*_http_requests_total`), see [`prometheus-slo-mesh.example.yml`](./prometheus-slo-mesh.example.yml). Merge selected rules into your Prometheus or use them as templates; add **`cluster` / `region`** label matchers for multi-site deployments. Operational guide: [`MULTI_REGION_SLO_RUNBOOK.md`](./MULTI_REGION_SLO_RUNBOOK.md).



## Notifications: Alertmanager (recommended)



By default, alerts appear in the Prometheus UI (**Alerts**). For **Slack, PagerDuty, email, etc.**:



1. Run [Alertmanager](https://prometheus.io/docs/alerting/latest/alertmanager/) and add an **`alerting`** block in `prometheus.yml` pointing at it.

2. Configure **routes** and **receivers** in `alertmanager.yml` (match on labels like `severity`, `cluster`).

3. Optionally reuse the same rule expressions in a **central** metrics stack (e.g. Mimir/Cortex) if you federate — still terminate notifications in Alertmanager or your org-standard tool.



Local / prod compose (**`otel`** / **`observability`** profiles) includes **Alertmanager** on port **9093** with [`alertmanager.yml`](./alertmanager.yml) — edit receivers there, or replace with your platform chart.



## Duplicating rules elsewhere



If operators use a **different** alerting UI, mirror the PromQL **`expr`**, **`for`**, and labels (`severity`, annotations) from [`prometheus-rules.hive.yml`](./prometheus-rules.hive.yml). Metric names (`hive_span_*`, `hive_mesh_*`) must match what your collector exports.


