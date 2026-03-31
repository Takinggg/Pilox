# Hive — Synthèse direction 2026 (1 page)

**Objectif** : livrer une Hive **stable, scalable, sécurisée et monétisable**, sans contredire l’architecture déjà documentée : **mesh v1 local additif**, **mesh V2 / planétaire en couches**, **produit « 1.0 »** distinct du **contrat mesh** (`meshV2` / OpenAPI).

---

## Principes non négociables (alignés repo)

1. **Le bus v1 (Redis + A2A) reste** pour le tenant isolé : la **dégradation gracieuse** est un principe officiel (`MESH_V2_GLOBAL.md`). Le WAN **s’ajoute** ; on ne « remplace Redis » par NATS pour tout le produit en une seule phase.
2. **Transport WAN** : un **pivot MVP** (souvent **NATS JetStream** hub/leaf) avant d’élargir à **libp2p** / DHT — cf. milestones **P1–P6** (`MESH_V2_GLOBAL.md` §3.1, `MESH_PLANETARY_P3_TRANSPORT.md`).
3. **Confiance inter-sites** : **mTLS** en priorité **côté reverse proxy / LB** (`MESH_FEDERATION_RUNBOOK.md`, `MESH_MTLS.md`) ; JWT fédérés **déjà** dans la trajectoire (HS256 / Ed25519, anti-replay `jti` via Redis).
4. **Redis** : réduire la **surface de confiance pour le cross-tenant**, pas promettre « zéro Redis pour la sécurité » tant que rate limits / anti-replay JWT s’y appuient — documenter un **ADR** si changement de store.
5. **Stripe / billing** : **compliance + juridique** en parallèle du code (`MARKETPLACE_V2_SCALING.md`) ; sandbox et webhooks **avant** la prod.

---

## Jalons trimestriels (recadrés)

| Période | Focus | Critère de sortie |
|--------|--------|-------------------|
| **Q1** | Baseline fédération + Stripe minimal | Gap analysis vs `MESH_V2_GLOBAL.md` ; **staging 2 instances** ; crédits / usage + **webhooks Stripe testés** (sandbox). |
| **Q2** | Transport WAN + durcissement | **NATS** (ou relais) pour chemins **multi-site** ; **Redis inchangé** pour le local ; mTLS **infra** ; pas de DHT « sans config » en condition de succès unique si non budgétée. |
| **Q3** | Monétisation + UX | Abonnements / litiges **selon capacité légale** ; dashboard **SLO** (pas seulement satisfaction subjective). |
| **Q4** | Prod « Hive 1.0 » + scaling | Tests charge **réalistes** (latence WAN, partitions) ; **tag produit** explicite vs **version mesh** ; doc + runbooks à jour. |

---

## Numérotation des releases

- **Hive 1.0** = **produit** (support, stabilité API, déploiement).
- **`meshV2` / schémas** = **contrat mesh** (ex. statut fédération, planetary) — **ne pas les confondre** dans les annonces.

---

## Risques & mitigations (rappel)

| Risque | Mitigation |
|--------|------------|
| Scope « tout remplacer » (Redis, stack) | Découper en **ADR** ; **feature flags** (`MESH_ROLLOUT_PLAYBOOK.md`). |
| Fédération fragile | **Runbook** + `?probe=1` ; tests **multi-instance** en CI/staging. |
| Stripe | Sandbox, idempotence webhooks, **support** et **politique litiges** avant marketing. |
| Charge | **k6** / lab multi-site (`deploy/p3-jetstream-multi-site-lab.md`) plutôt que chiffres arbitraires seuls. |

---

## Références

- **Checklist technique détaillée** : [`ROADMAP_2026_ENGINEERING_CHECKLIST.md`](./ROADMAP_2026_ENGINEERING_CHECKLIST.md)
- **Fédération** : [`MESH_FEDERATION_RUNBOOK.md`](./MESH_FEDERATION_RUNBOOK.md), [`MESH_V2_GLOBAL.md`](./MESH_V2_GLOBAL.md)
- **Planétaire P1–P6** : [`MESH_PLANETARY_TRACE.md`](./MESH_PLANETARY_TRACE.md)
- **Marketplace / billing** : [`MARKETPLACE_V2_SCALING.md`](./MARKETPLACE_V2_SCALING.md)
- **Onboarding** : [`GETTING_STARTED.md`](./GETTING_STARTED.md)
