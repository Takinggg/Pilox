# Hive Documentation

Index of documents useful for understanding and operating the product.

**Deployment model:** Hive is intended to run **via Docker** (Compose / Kubernetes). The `os/` directory is an optional appliance layer and is **not required** for running Hive.

| Document | Contents |
|----------|----------|
| [**ROADMAP_2026_EXEC_SUMMARY.md**](./ROADMAP_2026_EXEC_SUMMARY.md) | **Direction 2026 (1 page)** — principes (mesh additif, NATS avant DHT, Stripe + légal), jalons trimestriels recadrés, risques. |
| [**ROADMAP_2026_ENGINEERING_CHECKLIST.md**](./ROADMAP_2026_ENGINEERING_CHECKLIST.md) | **Checklist technique** — tickets par trimestre, fichiers du dépôt, critères de done (fédération, Stripe, NATS, release 1.0). |
| [**GETTING_STARTED.md**](./GETTING_STARTED.md) | **Dev local** — Docker Postgres/Redis, minimal `.env.local`, migrate, seed, dev server, troubleshooting, optional mesh. |
| [**DOCKER_ONLY.md**](./DOCKER_ONLY.md) | **Docker-only** — what to run, what to ignore (`os/`), links to the authoritative guides. |
| [**SERVER_INSTALL.md**](./SERVER_INSTALL.md) | **Installation sur un serveur** (FR) — Compose prod, DNS, Let’s Encrypt, wizard `/setup`, migrations, dépannage. |
| [**PRODUCTION.md**](./PRODUCTION.md) | Environment variables, TLS, health (`/api/health`), bootstrap, RBAC, backups, security links, **Stripe webhooks** (`/api/webhooks/stripe`). |
| [**STRIPE_LOCAL_DEV.md**](./STRIPE_LOCAL_DEV.md) | **Stripe en local** — CLI `stripe listen`, variables, cartes de test, événements webhooks. |
| [**RUNBOOK.md**](./RUNBOOK.md) | Incidents, DB restoration, key rotation, post-deployment checks. |
| [**A2A_INTEGRATION.md**](./A2A_INTEGRATION.md) | `@hive/a2a-sdk` integration (routes, Redis, env). |
| [**MESH_PUBLIC_A2A.md**](./MESH_PUBLIC_A2A.md) | **Unauthenticated** opt-in JSON-RPC (allowlist, rate limit, threats) — V2.3 bootstrap. |
| [**A2A_OPS_AUDIT.md**](./A2A_OPS_AUDIT.md) | A2A operational audit (scalability, multi-worker limitations). |
| [**PETIT_GROS_AUDIT.md**](./PETIT_GROS_AUDIT.md) | Short cross-cutting audit: public APIs, Redis, CORS, A2A, priorities. |
| [**CHECKUP_AUDIT.md**](./CHECKUP_AUDIT.md) | **Full audit / checkup**: tsc, tests, ESLint, npm audit, mesh DoD summary. |
| [**MESH_V1_REDIS_BUS.md**](./MESH_V1_REDIS_BUS.md) | Short spec: A2A + Redis pub/sub, v1 delivery guarantees. |
| [**MESH_V1_DONE.md**](./MESH_V1_DONE.md) | Mesh v1 **definition of done** (**100%** checklist for local scope). |
| [**MESH_V2_GLOBAL.md**](./MESH_V2_GLOBAL.md) | **Mesh V2** — WAN objective; **V2.0.x** = config + probe; **V2.1** = JSON-RPC transport (shared secret + operator proxy). |
| [**MESH_PLANETARY_TRACE.md**](./MESH_PLANETARY_TRACE.md) | **P1–P6 Traceability**: doc index ↔ OpenAPI schemas ↔ code (`mesh-version`, registry stub, public A2A). |
| [**MESH_PLANETARY_PRODUCT.md**](./MESH_PLANETARY_PRODUCT.md) | **MVP product scope** P1–P3: what is delivered (including WAN ingress → Redis). |
| [**MESH_PLANETARY_DEV_STACK.md**](./MESH_PLANETARY_DEV_STACK.md) | **Planetary dev stack** — start with the **TL;DR** section (NATS + `core` + smoke); then JetStream details, curl, `X-Forwarded-For`. |
| [**CDC_REGISTRY_PUBLIC.md**](./CDC_REGISTRY_PUBLIC.md) | **CDC registry public** — cahier des charges opérationnel + produit pour `services/registry` (API v1, sécurité, déploiement, intégration marketplace). |
| [**MESH_FEDERATION_RUNBOOK.md**](./MESH_FEDERATION_RUNBOOK.md) | **Runbook** for pairing 2+ instances (env, curls, incidents, secret rotation). |
| [**MESH_WAN_COMPLETE_DEPLOYMENT.md**](./MESH_WAN_COMPLETE_DEPLOYMENT.md) | **Guide opérateur :** déploiement complet registry + gateway + bridge + NATS + Hive (ordre, secrets, TLS, vérifs). |
| [**MESH_WORLD_NETWORK_EPIC.md**](./MESH_WORLD_NETWORK_EPIC.md) | **Epic (planning):** DHT/discovery, WAN relays/transport, centralized policy, multi-region SLO — GitHub issue templates + PR order. |
| [**MESH_DHT_OPERATOR_RUNBOOK.md**](./MESH_DHT_OPERATOR_RUNBOOK.md) | **Ops:** run `libp2p-dht-node`, copy multiaddrs into Hive + registry DHT **hint** env vars (`/.well-known`, registry health). |
| [**ADR-dht-directory-records.md**](./ADR-dht-directory-records.md) | **ADR:** DHT directory vs P1 registry (trust, TTL, witnesses) — design only. |
| [**MESH_CENTRALIZED_POLICY.md**](./MESH_CENTRALIZED_POLICY.md) | Org-wide policy distribution, versioning, audit (MVP = GitOps env). |
| [**MESH_ROLLOUT_PLAYBOOK.md**](./MESH_ROLLOUT_PLAYBOOK.md) | Feature flags, kill switches, exit criteria for mesh/WAN rollouts. |
| [**deploy/nats-jetstream-hive-mesh-wan.example.md**](./deploy/nats-jetstream-hive-mesh-wan.example.md) | Example NATS JetStream stream for subject `hive.mesh.wan` (transport-bridge). |
| [**deploy/p3-jetstream-multi-site-lab.md**](./deploy/p3-jetstream-multi-site-lab.md) | Two-footprint JetStream lab (hub/leaf, SLO probes) — not single-cluster CI. |
| Helm: [`deploy/helm/README.md`](../deploy/helm/README.md) | Chart index (gateway, transport-bridge, registry). |
| [`deploy/kubernetes/README.md`](../deploy/kubernetes/README.md) | Example **Job** manifests (P3 NATS smoke). |
| [**MARKETPLACE_ARCHITECTURE.md**](./MARKETPLACE_ARCHITECTURE.md) | In-app **marketplace** (catalog, cache, pins, **import/deploy** + `marketplace` provenance). |
| [**MARKETPLACE_V2_SCALING.md**](./MARKETPLACE_V2_SCALING.md) | **V2**: DB index, worker, pagination, Playwright E2E, roadmap (discovery / reputation / billing). |
| [**BILLING_METERING_SOURCES.md**](./BILLING_METERING_SOURCES.md) | **Cartographie** — wallet/Stripe app principale vs metering `Hive market-place` (quota tokens). |
| [**ADR/001-billing-stripe-internal-credits.md**](./ADR/001-billing-stripe-internal-credits.md) | **ADR** — Stripe + crédits internes (ledger Postgres). |
| [**THREAT_MODEL.md**](./THREAT_MODEL.md) | Threat / surface / mitigation overview. |
| [**TECH_VISION.md**](./TECH_VISION.md) | Long-term vision (OSS layers, confidential computing, mesh, etc.). |
| [**llm-optimization.md**](./llm-optimization.md) | Inference optimization spec (VM pause, Redis proxy, phases). |
| [**packages/a2a-sdk/docs/ARCHITECTURE.md**](../packages/a2a-sdk/docs/ARCHITECTURE.md) | A2A SDK architecture (Noise, Zod, rate limit, audit). |

**CDC** deliverables (Word) and associated scripts live under `CDC/` at the repository root.

---

## Developer Quick Start

1. **[GETTING_STARTED.md](./GETTING_STARTED.md)** (authoritative walkthrough)
2. [`app/README.md`](../app/README.md) — compact reference from the `app/` directory
3. `app/package.json` — `npm run dev`, `db:*`, `test`
