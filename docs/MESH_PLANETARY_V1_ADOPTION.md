# Planetary mesh — V1 adoption (risks, checklist, runbook)

> **Audience**: teams deploying the **in-repo reference** (P1–P6 hooks), not a managed global DHT or full VC/PDP product.  
> **Versioning**: stub reference line is [`PLANETARY_MESH_REFERENCE_VERSION`](../app/src/lib/mesh-version.ts); Hive ↔ peer wire uses [`MESH_V2_CONTRACT_VERSION`](../app/src/lib/mesh-version.ts). Changelog: [`MESH_PLANETARY_CHANGELOG.md`](./MESH_PLANETARY_CHANGELOG.md).  
> **Assemblage complet (Helm, bus, vérifs) :** [`MESH_WAN_COMPLETE_DEPLOYMENT.md`](./MESH_WAN_COMPLETE_DEPLOYMENT.md).

## 1. Residual risks (what can still go wrong)

| Risk | Why it matters | Mitigation |
|------|----------------|------------|
| **Misconfiguration** | Wrong `DATABASE_URL`, missing `REGISTRY_WRITE_SECRET`, NATS reachable without `BRIDGE_INTERNAL_SECRET`, bridge/subscriber subject mismatch | Use [`app/.env.example`](../app/.env.example) + service READMEs; enforce secrets in prod; run [`npm run smoke:planetary`](../app/package.json) after deploy |
| **Exposed internals** | `/v1/metrics` or write APIs without TLS/Bearer | TLS at Ingress or `GATEWAY_TLS_*`; set `REGISTRY_METRICS_BEARER` / `GATEWAY_METRICS_BEARER`; never expose registry POST without network policy + `REGISTRY_WRITE_SECRET` |
| **No backups** | Postgres holds directory of record; loss = rebuild trust graph | Automated Postgres backups + tested restore; document RPO/RTO |
| **Contract drift** | OpenAPI/schema changes break integrators | Follow [`MESH_PLANETARY_CHANGELOG.md`](./MESH_PLANETARY_CHANGELOG.md); bump `PLANETARY_MESH_REFERENCE_VERSION`; run `npm run docs:validate-planetary` in CI (already in **lint** job) |
| **Scope confusion** | Marketing “global mesh” vs **reference stubs** | Read [`MESH_PLANETARY_PRODUCT.md`](./MESH_PLANETARY_PRODUCT.md) — DHT, full DID/VC engines, managed WAF are **out of repo** |

## 2. Pre-production checklist

- [ ] **Registry**: `REGISTRY_DATABASE_URL` (prod Postgres), `REGISTRY_WRITE_SECRET`, optional `REGISTRY_METRICS_BEARER`, PDP allowlists if used (`REGISTRY_POST_*_ALLOWLIST`)
- [ ] **P4 sync** (if federating): `REGISTRY_SYNC_PEER_BASES`, `REGISTRY_SYNC_AUTH_BEARER`, `REGISTRY_SYNC_VERIFY_ED25519_PROOF` as required
- [ ] **P5**: `REGISTRY_VERIFY_ED25519_PROOF` and key distribution story documented
- [ ] **Gateway**: `GATEWAY_UPSTREAM_BASE`, shared secret with Hive (`GATEWAY_UPSTREAM_AUTH_SECRET` ↔ `MESH_GATEWAY_INBOUND_SECRET`), TLS or termination Ingress, `GATEWAY_METRICS_BEARER` if metrics enabled
- [ ] **Bridge / subscriber**: `BRIDGE_INTERNAL_SECRET` (and Hive ingress auth), `BRIDGE_NATS_URL`, consistent subject + mode (core vs JetStream)
- [ ] **Hive**: `HIVE_INTERNAL_TOKEN` / operator path for `POST /api/mesh/wan/ingress` as documented
- [ ] **Network**: no public registry POST without IP allowlist or private network; rate limits appropriate for your threat model
- [ ] **Observability**: scrape `/v1/metrics` with auth; optional Helm `ServiceMonitor` — [`deploy/helm/hive-mesh-gateway/README.md`](../deploy/helm/hive-mesh-gateway/README.md)
- [ ] **Smoke**: from `app/`, `npm run smoke:planetary` against prod URLs via env (`PLANETARY_*_URL`, optional `PLANETARY_*_METRICS_BEARER`)

## 3. Minimal production runbook

1. **Bootstrap**: NATS (or managed equivalent) → Postgres → registry → gateway (behind TLS) → bridge → subscriber → Hive with Redis.
2. **Secrets**: rotate `REGISTRY_WRITE_SECRET`, `BRIDGE_INTERNAL_SECRET`, gateway/upstream shared secret; store in vault/K8s secrets, not git.
3. **Upgrade**: pull image/tag → run DB migrations if registry schema changed → rolling restart → smoke test.
4. **Incident**: check registry/gateway/bridge health endpoints; verify NATS connectivity; inspect Prometheus `http_requests_total` and app mesh metrics; see [`docs/observability/`](./observability/).
5. **Federation ops** (Hive peers): still align with [`MESH_FEDERATION_RUNBOOK.md`](./MESH_FEDERATION_RUNBOOK.md) where applicable.

## 4. What CI already guarantees

- **lint** (`app/`): `docs:validate-planetary` on every PR/push to `main`.
- **planetary-stubs**: `registry` (`npm ci`, `check`, `test`), `transport-bridge` (`npm ci`, `check`, **NATS core + JetStream** `p3-nats-smoke`), `gateway` (`npm ci`, `npm run check`), `libp2p-dht-node` health curl.
- **helm-template**: render Helm charts + parse `deploy/kubernetes/*.example.yaml` with `scripts/validate-k8s-example-yaml.py`.
- **planetary-docker**: `docker compose --profile planetary-dht build` (default planetary stubs + optional DHT image).
- **planetary-smoke**: Compose up (NATS + registry + gateway + bridge) → `/v1/health` → `scripts/planetary-smoke.mjs` → **`npm run smoke:p3-nats`** (core) contre le bridge compose (secret aligné sur le défaut `docker-compose.yml`).

Production smoke with **custom URLs** / metrics Bearer remains an **operator** step via env vars (`PLANETARY_*`).
