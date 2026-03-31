# Multi-region SLO (operational runbook)

“**SLO multi-région opéré**” is not a single binary: it is **how** you run Prometheus (or Mimir) + **Alertmanager** (and optionally Hive **`/observability`** or your own dashboards) across **clusters** or **regions**.

## 1. Metric labels

Ensure every scrape target adds **`cluster`** (or **`region`**) consistently, e.g.:

- Prometheus `static_configs` / `relabel_configs`
- Kubernetes `ServiceMonitor` `metricRelabelings` or pod labels picked up by the operator

Stub metrics (`hive_gateway_http_requests_total`, `hive_registry_http_requests_total`) must be **distinguishable per site** after relabel.

## 2. Recording rules

Use [`prometheus-slo-mesh.example.yml`](./prometheus-slo-mesh.example.yml):

- Copy the **commented** `cluster` matchers into live rules when you have more than one mesh footprint.
- One **recording rule group per region** is acceptable if you prefer federation instead of one global Prometheus.

## 3. Dashboards

- Use Hive **`/observability`** (per environment) or Prometheus **Graph** with **`cluster` / `region`** label filters.
- Compare **error ratio** and **latency** side-by-side; alert on **per-region** burn when a single site violates budget.

## 4. Alerting

- Route **severity** by label: e.g. `cluster=eu` → on-call EU.
- Avoid one global alert that fires when **any** region blips without context — include `cluster` in the **annotation** text.

## 5. Error budget policy

Define **availability** (e.g. 99.9%) per **gateway** / **registry** tier, then map:

- `hive:gateway:http_success_ratio:5m` (from the example file) to a **multi-window** burn rule in your central alerting stack.

This repository only ships **examples**; **operation** (PagerDuty, runbooks, game days) remains your platform team’s responsibility.

## 6. Two-region checklist (copy-paste)

1. **Labels:** gateway + registry pods (or ServiceMonitor `metricRelabelings`) expose **`cluster`** or **`region`** on `hive_*` metrics — see [`deploy/helm/hive-mesh-gateway/values.yaml`](../../deploy/helm/hive-mesh-gateway/values.yaml) **`podLabels`** (documented in [`deploy/helm/hive-mesh-gateway/README.md`](../../deploy/helm/hive-mesh-gateway/README.md)).
2. **Rules:** copy [`prometheus-slo-mesh.example.yml`](./prometheus-slo-mesh.example.yml) group `hive_mesh_slo_by_cluster` (or equivalent) into your Prometheus / Mimir; reload.
3. **Dashboards:** filter or template by `cluster` / `region` in your charts (Hive UI presets or PromQL); compare error ratio side-by-side.
4. **Alerts:** route by `cluster` label; annotation text must include region name (avoid generic “mesh down”).
5. **Game day:** trip one region’s gateway; confirm burn alert fires **only** for that `cluster`.

## See also

- [`../MESH_WORLD_NETWORK_EPIC.md`](../MESH_WORLD_NETWORK_EPIC.md) — epic planning (issue templates for multi-region SLO work packages).
- [`../MESH_ROLLOUT_PLAYBOOK.md`](../MESH_ROLLOUT_PLAYBOOK.md) — staged rollout and kill switches.
