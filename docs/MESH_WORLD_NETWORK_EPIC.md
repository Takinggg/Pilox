# Epic: world-scale network layer (DHT, relays, policy, SLO)

**Status:** planning — split into GitHub issues / targeted PRs.  
**Purpose:** single place to track the “next layer” after HTTP registry + federation v1: **DHT/discovery**, **relays / WAN transport**, **centralized policy**, **multi-region SLO**, and **safe rollout**.

Copy the **Issue template** sections below into GitHub (one issue per `### Title`). Labels are suggestions.

---

## Goals

- **Discovery:** optional DHT / peer directory path, aligned with `MESH_PLANETARY_P4_DHT_ROADMAP.md` and `services/libp2p-dht-node/`.
- **Transport:** clear story for multi-hop WAN (NATS JetStream per `MESH_PLANETARY_P3_TRANSPORT.md`, Redis bus, gateway) and what is shipped vs draft.
- **Policy:** explicit source of truth and propagation for mesh/registry/gateway rules (centralized or federated), with audit hooks.
- **SLO:** multi-region error budgets and alerts grounded in `docs/observability/MULTI_REGION_SLO_RUNBOOK.md`.
- **Rollout:** feature flags, staged enablement, exit criteria.

## Non-goals (for this epic)

- Replacing the P1 HTTP registry with DHT storage.
- A single global “Hive-operated” production network (operators run their own sites).

## Suggested dependency order

```text
Doc / ADR alignment (DHT + transport + policy)
        ↓
Reference implementations & wiring (bootstrap, bridge, metrics labels)
        ↓
Observability + SLO examples in deploy
        ↓
Rollout playbook + feature flags
```

---

## Issue 1 — Epic tracker (parent)

### Title

`[Epic] World-scale mesh: DHT, relays, centralized policy, multi-region SLO`

### Labels

`epic`, `mesh`, `documentation`

### Body

Parent issue for the world-scale network layer. Tracks children:

- DHT / discovery alignment and operator path
- WAN transport (relays / JetStream / gateway / Redis) gap analysis
- Centralized policy distribution and audit
- Multi-region SLO wiring in examples / Helm
- Feature flags and staged rollout

**Reference:** `docs/MESH_WORLD_NETWORK_EPIC.md`

### Acceptance criteria

- [ ] Child issues linked in the first comment
- [ ] Owner and target quarter (or “backlog”) noted

---

## Issue 2 — DHT discovery: operator path & bootstrap hints

**Shipped:** [`MESH_DHT_OPERATOR_RUNBOOK.md`](./MESH_DHT_OPERATOR_RUNBOOK.md); links from P4, `MESH_LIBP2P_DHT_NODE`, service README; **CI smoke** in `.github/workflows/ci.yml` (`planetary-stubs` → libp2p health curl).

### Title

`[mesh] DHT discovery — operator runbook: bootstrap hints ↔ libp2p-dht-node`

### Labels

`mesh`, `documentation`, `operations`

### Body

**Context:** `MESH_PUBLIC_DHT_BOOTSTRAP_URLS` / descriptor `publicMesh.dhtBootstrapHints` and registry health hints are **curated strings** only (see `MESH_PLANETARY_P4_DHT_ROADMAP.md`). The optional `services/libp2p-dht-node` is a real Kad-DHT process (`MESH_LIBP2P_DHT_NODE.md`).

**Deliverables:**

1. Short **operator runbook** section (new doc or extension of `MESH_LIBP2P_DHT_NODE.md`): how to copy multiaddrs from DHT node health/logs into Hive + registry hints.
2. **Verification:** document `docker compose` or `helm` steps to run libp2p-dht-node + confirm health; optional CI smoke (non-flaky) if feasible.

**Out of scope:** automatic wiring from Hive to libp2p (unless trivial).

### Acceptance criteria

- [ ] Runbook merged under `docs/` and linked from `MESH_PLANETARY_P4_DHT_ROADMAP.md`
- [ ] Steps tested once on a clean machine (record command transcript in PR description)
- [ ] No change to security posture of HTTP surfaces without explicit review

---

## Issue 3 — DHT / directory ADR: record types & trust

**Shipped:** [`ADR-dht-directory-records.md`](./ADR-dht-directory-records.md); linked from [`MESH_PLANETARY_P4_DHT_ROADMAP.md`](./MESH_PLANETARY_P4_DHT_ROADMAP.md).

### Title

`[mesh] ADR — DHT directory records vs P1 registry (trust, witnesses)`

### Labels

`mesh`, `documentation`, `architecture`

### Body

**Context:** P4 roadmap states trust must apply to **routing messages** and **witnesses**, not only `hive-registry-record-v1` (`MESH_PLANETARY_P4_DHT_ROADMAP.md`).

**Deliverables:**

- New ADR under `docs/` (e.g. `ADR-00xx-dht-directory-records.md`): what would be stored in DHT (e.g. handle → peer set), signature model, replay/eviction, relation to registrar PDP.
- Explicit **threat model** subsection (spoofing, eclipse, stale records).

### Acceptance criteria

- [ ] ADR merged; linked from `MESH_PLANETARY_P4_DHT_ROADMAP.md` and `MESH_LIBP2P_DHT_NODE.md`
- [ ] Clear “not implemented” vs “future implementation” boundaries
- [ ] Security / federation stakeholders acknowledged in PR

---

## Issue 4 — WAN transport & relays: implemented vs proposed

**Shipped:** **Guide d’assemblage opérateur** [`MESH_WAN_COMPLETE_DEPLOYMENT.md`](./MESH_WAN_COMPLETE_DEPLOYMENT.md); **Implementation matrix** + follow-ups in [`MESH_PLANETARY_P3_TRANSPORT.md`](./MESH_PLANETARY_P3_TRANSPORT.md); **Helm index** [`deploy/helm/README.md`](../deploy/helm/README.md); **bridge chart** [`deploy/helm/hive-transport-bridge/`](../deploy/helm/hive-transport-bridge/README.md); **JetStream example** [`docs/deploy/nats-jetstream-hive-mesh-wan.example.md`](./deploy/nats-jetstream-hive-mesh-wan.example.md); **multi-site lab** [`docs/deploy/p3-jetstream-multi-site-lab.md`](./deploy/p3-jetstream-multi-site-lab.md). CI: `helm-template` (incl. YAML examples) + `planetary-stubs` **core + JetStream** NATS smoke + `planetary-smoke` **p3-nats** contre compose.

### Title

`[mesh] WAN transport gap analysis — P3 JetStream vs Redis vs gateway (doc + issue list)`

### Labels

`mesh`, `documentation`, `gateway`

### Body

**Context:** `MESH_PLANETARY_P3_TRANSPORT.md` proposes NATS JetStream as MVP pivot; repo has Redis WAN path, gateway, optional `services/transport-bridge/`, `wan-envelope-v1`.

**Deliverables:**

1. Table **Implemented / partial / proposed** with pointers to code paths and OpenAPI (`docs/openapi/transport-bridge-v1.yaml`, `schemas/wan-envelope-v1.schema.json`).
2. List of **follow-up issues** (e.g. Helm for bridge, NATS mTLS, subject naming, back-pressure).
3. Cross-link `MESH_V1_REDIS_BUS.md` and gateway README.

### Acceptance criteria

- [ ] Doc merged under `docs/` (or major section in `MESH_PLANETARY_P3_TRANSPORT.md`)
- [ ] At least three concrete child issues opened or referenced as “Future work #…”
- [ ] No false claims of production multi-region JetStream without evidence

---

## Issue 5 — Centralized policy: source of truth & propagation

**Shipped:** [`MESH_CENTRALIZED_POLICY.md`](./MESH_CENTRALIZED_POLICY.md); **§7** in [`MESH_FEDERATION_RUNBOOK.md`](./MESH_FEDERATION_RUNBOOK.md).

### Title

`[mesh] Centralized policy — distribution, versioning, audit (registry / gateway / Hive)`

### Labels

`mesh`, `security`, `registry`, `architecture`

### Body

**Context:** Federation and registry already involve tokens, manifests, and PDP-style logic in services. A “centralized policy” layer should define:

- **Authoritative source** (registry bundle, signed manifest, OPA bundle, etc.)
- **Consumers** (gateway, Hive, workers) and **cache/TTL** semantics
- **Audit** (who published, version, rollback)

**Deliverables:**

- ADR or runbook extension (e.g. `MESH_FEDERATION_RUNBOOK.md` + new section) with sequence diagrams (mermaid OK).
- Map to existing code (`registry-pdp-http`, publish readiness, mesh federation env).

### Acceptance criteria

- [ ] Doc merged with explicit **MVP** vs **later** steps
- [ ] Threat model: compromised publisher, stale policy, split-brain
- [ ] Links to `docs/MESH_MTLS.md` and `docs/CDC_REGISTRY_PUBLIC.md` where relevant

---

## Issue 6 — Multi-region SLO: examples wired to deploy

**Shipped:** [`observability/prometheus-slo-mesh.example.yml`](./observability/prometheus-slo-mesh.example.yml) — active `hive_mesh_slo_by_cluster` group + header comments; **§6** two-region checklist in [`observability/MULTI_REGION_SLO_RUNBOOK.md`](./observability/MULTI_REGION_SLO_RUNBOOK.md); Helm **`podLabels`** in [`deploy/helm/hive-mesh-gateway/values.yaml`](../deploy/helm/hive-mesh-gateway/values.yaml) + [`README.md`](../deploy/helm/hive-mesh-gateway/README.md).

### Title

`[observability] Multi-region SLO — exemplar rules + Helm/Prometheus comments`

### Labels

`observability`, `mesh`, `documentation`

### Body

**Context:** `docs/observability/MULTI_REGION_SLO_RUNBOOK.md` and `prometheus-slo-mesh.example.yml` are examples only.

**Deliverables:**

1. Ensure **metric labels** story matches gateway/registry stubs (document `cluster` / `region` relabel expectations).
2. Add or extend **Helm values** / `deploy/` comments pointing operators to copy recording rules with `cluster` matchers.
3. Optional: one **dashboard variable** doc snippet for Hive `/observability` or Prometheus (link to [`observability/README.md`](./observability/README.md) presets / legacy JSON if applicable).

### Acceptance criteria

- [ ] PR touches only docs and/or non-breaking deploy examples
- [ ] Runbook updated with “copy-paste checklist” for two regions
- [ ] No PagerDuty secrets in repo

---

## Issue 7 — Feature flags & staged rollout for mesh transport/DHT

**Shipped:** [`MESH_ROLLOUT_PLAYBOOK.md`](./MESH_ROLLOUT_PLAYBOOK.md); cross-links from [`observability/MULTI_REGION_SLO_RUNBOOK.md`](./observability/MULTI_REGION_SLO_RUNBOOK.md) “See also”.

### Title

`[mesh] Rollout playbook — feature flags, kill switch, exit criteria`

### Labels

`mesh`, `operations`, `documentation`

### Body

**Deliverables:**

- Document **env flags** (existing + proposed) for enabling DHT hints, JetStream bridge, experimental paths.
- **Staged rollout:** dev → single region → multi-region; **exit criteria** (error rate, latency SLO burn).
- **Rollback:** disable flag, drain queues, revert descriptor hints.

**Cross-link:** `docs/PRODUCTION.md`, `MESH_FEDERATION_RUNBOOK.md`, `MULTI_REGION_SLO_RUNBOOK.md`.

### Acceptance criteria

- [ ] Playbook merged under `docs/` (or section in `MULTI_REGION_SLO_RUNBOOK.md`)
- [ ] Each flag has: default, safe value, blast radius
- [ ] Linked from epic tracker issue

---

## PR slicing hint (for implementers)

| PR focus | Typical size |
|----------|----------------|
| Docs only (ADR, runbook, gap table) | Small |
| Helm / example Prometheus rules | Small |
| Code path changes (bridge, gateway, Hive) | Medium; behind flag |
| New long-lived service dependencies | Separate PR + ops review |

---

## Related docs (index)

| Topic | Doc |
|-------|-----|
| P4 DHT roadmap | `MESH_PLANETARY_P4_DHT_ROADMAP.md` |
| libp2p DHT node | `MESH_LIBP2P_DHT_NODE.md`, `services/libp2p-dht-node/README.md` |
| P3 WAN transport | `MESH_PLANETARY_P3_TRANSPORT.md` |
| Redis bus | `MESH_V1_REDIS_BUS.md` |
| Federation ops | `MESH_FEDERATION_RUNBOOK.md` |
| mTLS | `MESH_MTLS.md` |
| Multi-region SLO | `observability/MULTI_REGION_SLO_RUNBOOK.md`, `observability/prometheus-slo-mesh.example.yml` |
| Production | `PRODUCTION.md` |
| DHT ADR | `ADR-dht-directory-records.md` |
| Centralized policy | `MESH_CENTRALIZED_POLICY.md` |
| Rollout / flags | `MESH_ROLLOUT_PLAYBOOK.md` |
| Transport bridge Helm | `deploy/helm/hive-transport-bridge/README.md` |
| JetStream example | `docs/deploy/nats-jetstream-hive-mesh-wan.example.md` |
