# Hive 2026 — Checklist technique (alignée dépôt)

Document de travail pour **tickets / sprints** : zones du repo, fichiers à lire, et critères de done **réalistes**. Cocher au fur et à mesure.

---

## 0. Baseline (avant d’engager du trimestre)

- [ ] **Lire** `docs/MESH_V2_GLOBAL.md` (phases V2.0–V2.4 + §3.1 planétaire).
- [ ] **Lire** `docs/MESH_V1_DONE.md` (périmètre v1 fermé).
- [ ] **Lire** `docs/MARKETPLACE_V2_SCALING.md` (billing = roadmap + review légale).
- [ ] **Noter** la version **`meshV2`** exposée par `GET /api/mesh/federation/status` / `GET /.well-known/hive-mesh.json` (ne pas confondre avec **Hive 1.0 produit**).
- [ ] **Staging** : 2 instances Hive avec TLS (`MESH_FEDERATION_*`) selon `docs/MESH_FEDERATION_RUNBOOK.md`.

---

## Q1 — Fondation : fédération + Stripe minimal

### Fédération (compléter / durcir ce qui existe)

| # | Tâche | Fichiers / zones | Done quand |
|---|--------|------------------|------------|
| F1 | Cartographier l’existant (proxy, manifeste, directory, probe). | `app/src/lib/mesh-federation-*.ts`, `app/src/app/api/mesh/federation/**`, `app/src/app/.well-known/hive-mesh.json/route.ts` | Liste d’écarts vs `MESH_V2_GLOBAL.md` V2.0–V2.2 |
| F2 | Tests fédération (auth, `peerIndex`, erreurs manifeste). | `app/src/lib/mesh-federation-*.test.ts`, `app/src/app/api/mesh/federation/**/route.test.ts` | CI verte ; cas limites documentés |
| F3 | Runbook opérateur à jour (2 nœuds). | `docs/MESH_FEDERATION_RUNBOOK.md` | Nouveau contributeur reproduit le pairing |
| F4 | Dégradation : fédération off → **mesh v1** uniquement. | `app/src/lib/mesh-federation-resolve.ts`, `GET /api/a2a/status` | Comportement vérifié en test ou doc |

### Stripe / billing (nouveau — pas encore dans le repo comme intégration complète)

| # | Tâche | Fichiers / zones | Done quand |
|---|--------|------------------|------------|
| S1 | **ADR** : choix Stripe (Customer, Balance, Metering vs crédits internes). | `docs/ADR/001-billing-stripe-internal-credits.md`, `docs/BILLING_METERING_SOURCES.md` | Revue équipe + juridique si applicable ; ADR technique posé |
| S2 | Webhooks Stripe (sandbox) : `payment_intent.succeeded`, `charge.refunded`, idempotence. | `app/src/app/api/webhooks/stripe/route.ts`, `app/src/lib/stripe/process-stripe-webhook.ts`, `STRIPE_*` dans `app/.env.example`, `docs/PRODUCTION.md` §2.1 | Signature vérifiée ; Redis idempotency ; audit ; tests Vitest |
| S3 | Relier au **crédit / quota** utilisateur ou org (schéma DB). | `0021_user_wallet_billing.sql`, `0022_billing_ledger_user_created_idx.sql`, `user_wallet_balances`, `billing_ledger_entries`, `users.stripe_customer_id` | `npm run db:migrate:run` — crédits via webhooks + `GET /api/billing/wallet` + `GET /api/billing/ledger` |
| S4 | Metering : réutiliser le contrat **usage** existant (`app/Hive market-place` `usage-metering.mjs`) ou **documenter** la fusion vers l’app principale. | `docs/BILLING_METERING_SOURCES.md`, `app/Hive market-place/src/marketplace/usage-metering.mjs`, `app/src/lib/inference-meter.ts` | Cartographie repo : fusion produit = décision ultérieure |

---

## Q2 — Transport WAN + sécurité (sans « supprimer Redis »)

### NATS / JetStream (P3)

| # | Tâche | Fichiers / zones | Done quand |
|---|--------|------------------|------------|
| N1 | Lab **deux sites** JetStream (hub/leaf). | `docs/deploy/p3-jetstream-multi-site-lab.md`, `docs/deploy/nats-jetstream-hive-mesh-wan.example.md` | Reproductible par un dev |
| N2 | Bridge / gateway → chemins documentés. | `services/transport-bridge/`, `docs/MESH_PLANETARY_P3_TRANSPORT.md`, `docs/MESH_GATEWAY_WAN.md` | Smoke test WAN documenté |
| N3 | **Ne pas** exiger « remplacement Redis » pour le bus v1 ; ajouter **bridge** WAN si besoin. | `docs/MESH_V1_REDIS_BUS.md` | ADR si changement de frontière |

### mTLS + JWT

| # | Tâche | Fichiers / zones | Done quand |
|---|--------|------------------|------------|
| T1 | mTLS **terminaison** (LB / ingress) documentée pour les pairs fédérés. | `docs/MESH_MTLS.md`, `docs/deploy/edge-tls-mesh-services.md` | Checklist opérateur |
| T2 | JWT fédérés : **Ed25519** en prod, rotation des clés. | `app/src/lib/mesh-federation-proxy-outbound.ts`, env `MESH_FEDERATION_*` | Runbook rotation |
| T3 | Redis et sécurité : **documenter** ce qui reste dans Redis (RL, `jti`). | `docs/THREAT_MODEL.md` | Revue trimestrielle |

### Découverte dynamique (P4 — non bloquante Q2)

| # | Tâche | Fichiers / zones | Done quand |
|---|--------|------------------|------------|
| D1 | Si DHT libp2p : suivre `docs/MESH_LIBP2P_DHT_NODE.md`, `docs/MESH_DHT_OPERATOR_RUNBOOK.md`. | `services/` stubs | Lab uniquement sauf décision produit |
| D2 | Alternative **registres fédérés** (sans DHT). | `docs/MESH_PLANETARY_P4_FEDERATED_SYNC.md`, `services/registry/` | MVP sync documenté |

---

## Q3 — Monétisation complète + UX

| # | Tâche | Fichiers / zones | Done quand |
|---|--------|------------------|------------|
| B1 | Abonnements Stripe (Checkout + Customer Portal ou équivalent). | `app/src/app/api/**`, UI `app/src/app/(dashboard)/` | Parcours E2E Playwright |
| B2 | Litiges / chargebacks → règles métier (suspendre agent, etc.). | Policy + `auditLogs` | Tests + doc FAQ |
| B3 | Dashboard usage / coûts : étendre l’existant `(dashboard)`. | `app/src/app/(dashboard)/`, composants métriques | SLO affichés (latence, budget) |
| B4 | Marketplace : achat / déploiement depuis UI (aligné `MARKETPLACE_ARCHITECTURE.md`). | `app/src/app/(dashboard)/marketplace/**`, `app/src/app/api/marketplace/**` | E2E marketplace |

---

## Q4 — Production, scaling, release « Hive 1.0 »

| # | Tâche | Fichiers / zones | Done quand |
|---|--------|------------------|------------|
| P1 | Tests charge (k6 ou équivalent) : **scénarios WAN** (latence, pertes). | `docs/deploy/p3-wan-backpressure.md` | Rapport chiffré |
| P2 | Observabilité : OTel app (`app/src/lib/otel-bootstrap.ts`) + métriques services. | `docs/observability/`, Prometheus sur registry/gateway | Dashboards SLO |
| P3 | Bug bash P0/P1 ; gel des breaking changes API. | `docs/PRODUCTION.md`, `CHANGELOG` | Critères release |
| P4 | **Tag Git** `hive-v1.0.0` (ou nom défini) + **images Docker** ; note release **produit vs mesh**. | `.github/workflows/`, `app/Dockerfile` | Annonce + doc |

---

## Index rapide par dossier

| Dossier | Rôle roadmap |
|---------|----------------|
| `app/src/lib/mesh-federation-*.ts` | Fédération, peers, proxy |
| `app/src/app/api/mesh/` | Routes mesh / fédération |
| `app/` (Next.js) | Stripe, webhooks, UI billing |
| `app/Hive market-place/` | Metering marketplace (Node) |
| `services/registry/`, `services/transport-bridge/`, `services/gateway/` | Planétaire / WAN |
| `docs/MESH_*.md`, `docs/deploy/` | Specs + runbooks |
| `deploy/helm/` | K8s gateway / observability |

---

## Dépendances externes (à ne pas sous-estimer)

- **Juridique / fiscal** : Stripe (UE, TVA, conditions marketplace).
- **Ops** : TLS, NATS, Redis, Postgres — `docs/MESH_WAN_COMPLETE_DEPLOYMENT.md`.
- **Support** : canal early adopters (hors repo — process produit).
