# CDC — Registry Hive public (annuaire planétaire P1)

> **Type** : cahier des charges opérationnel + produit pour l’exposition **Internet-facing** du service `services/registry`.  
> **Statut** : normatif pour le déploiement public ; les détails d’API **machine** restent la source de vérité dans [`openapi/registry-v1.yaml`](./openapi/registry-v1.yaml) et [`schemas/hive-registry-record-v1.schema.json`](./schemas/hive-registry-record-v1.schema.json).  
> **Version document** : 1.1 — 2026-03-22  
> **Traçabilité** : [`MESH_PLANETARY_TRACE.md`](./MESH_PLANETARY_TRACE.md), spec courte P1 [`MESH_PLANETARY_P1_GLOBAL_DIRECTORY.md`](./MESH_PLANETARY_P1_GLOBAL_DIRECTORY.md).  
> **Plan Hub + miroir Git + tenants instances** : [`HIVE_GLOBAL_REGISTRY_GIT_PLAN.md`](./HIVE_GLOBAL_REGISTRY_GIT_PLAN.md).

---

## 1. Résumé exécutif

Le **registry public Hive** est un service HTTP léger qui :

1. **Publie** un annuaire de **handles stables** → **métadonnées de découverte** (typiquement une **Agent Card** HTTPS et optionnellement un **descriptor mesh**).
2. **Ne remplace pas** l’exécution des agents ni le routage du trafic applicatif : les clients résolvent le handle, puis contactent **directement** l’origine du nœud (ou passent par les mécanismes mesh / gateway déjà documentés ailleurs).
3. Joue le rôle d’**amorçage** et d’**index** pour le réseau — comparable à un **DNS / annuaire** pour l’« Internet des agents », **sans** être un « master » qui centralise la compute.

**Implémentation de référence** : [`services/registry/`](../services/registry/) (Node.js), image Docker [`services/registry/Dockerfile`](../services/registry/Dockerfile).

---

## 2. Objectifs produit

| ID | Objectif | Critère de succès |
|----|----------|-------------------|
| O1 | Permettre à un client inconnu du nœud de **trouver** comment joindre un agent via un **handle stable** | `GET /v1/records/{handle}` retourne un record valide JSON Schema + lien `agentCardUrl` atteignable |
| O2 | Offrir un **catalogue** (liste de handles) pour synchronisation fédérée et outils (marketplace, crawlers autorisés) | `GET /v1/records` conforme OpenAPI ; option secret catalogue |
| O3 | Permettre aux **opérateurs** de **publier** et **révoquer** des entrées de façon contrôlée | `POST /v1/records` et `DELETE /v1/records/{handle}` avec secrets dédiés, politiques d’allowlist |
| O4 | Résister aux abus **lecture** (scraping, DoS léger) et **écriture** (spam de records) | Rate limits configurables ; optional Redis pour réplicas |
| O5 | Assurer la **continuité** du réseau existant si le registry tombe | Les pairs déjà connectés continuent de fonctionner ; seuls l’onboarding et la découverte globale en pâtissent temporairement |

---

## 3. Périmètre

### 3.1 Dans le périmètre (cette CDC + service actuel)

- API **v1** : health, metrics Prometheus, records CRUD logique (POST upsert, GET by handle, GET liste, DELETE), resolve inverse par `agentCardUrl`.
- Validation **Ajv** des corps et réponses selon **hive-registry-record-v1**.
- Persistance **PostgreSQL** optionnelle (`REGISTRY_DATABASE_URL`) — recommandée en production publique.
- **Rate limiting** lecture / écriture (mémoire ou Redis).
- **Revocation** : `DELETE` ; hint temporel `validUntil` + flags `REGISTRY_ENFORCE_VALID_UNTIL` / `REGISTRY_REJECT_EXPIRED_WRITES`.
- **Preuve Ed25519** optionnelle sur le record (P5) : `REGISTRY_VERIFY_ED25519_PROOF`.
- **Politiques opérateur** : allowlists handle / host `agentCardUrl` ; PDP HTTP externe optionnel.
- **Sync fédérée** (P4) : tirage périodique depuis d’autres origines registry, preuve de catalogue signée optionnelle.
- **Observabilité** : `/v1/metrics` avec auth optionnelle.

### 3.2 Hors périmètre (explicitement)

- **Paiement**, **JWT consommateur**, **marketplace transactionnel** : hors de ce service ; un marketplace peut **consommer** `GET /v1/records` comme index. Évolution : champs métadonnées ou service annexe — pas requis pour ouvrir un registry public minimal.
- **Transport applicatif** mesh (NATS, passerelles, ingress WAN) : voir P2–P3–P6 dans [`MESH_PLANETARY_TRACE.md`](./MESH_PLANETARY_TRACE.md).
- **DHT complète / gossip pur P2P** : roadmap [`MESH_PLANETARY_P4_DHT_ROADMAP.md`](./MESH_PLANETARY_P4_DHT_ROADMAP.md) ; le registry HTTP reste la couche **bootstrap** pragmatique V1.
- **Moteur DID/VC complet** : le schéma prépare `controllerDid`, `didDocumentUrl`, `proof` ; l’émission/validation VC est **responsabilité opérateur** (cf. [`MESH_PLANETARY_P5_TRUST_PROOF.md`](./MESH_PLANETARY_P5_TRUST_PROOF.md)).

---

## 4. Parties prenantes et rôles

| Rôle | Responsabilité |
|------|----------------|
| **Opérateur registry** | Héberge le service, configure TLS, secrets, Postgres, limites, allowlists, sauvegardes |
| **Opérateur nœud Hive** | Publie un record pointant vers **son** `agentCardUrl` / `meshDescriptorUrl` ; maintient HTTPS valide côté nœud |
| **Client / intégrateur** | Résout `handle` → métadonnées ; applique politique de confiance (TLS, clés, réputation) **côté client** |
| **Fédération** | Autres instances registry qui **pull** le catalogue (P4) avec auth Bearer mutuelle si configurée |

---

## 5. Architecture logique

```mermaid
flowchart LR
  subgraph public [Internet]
    C[Client]
  end
  subgraph bootstrap [Registry public]
    R[GET /v1/records/handle]
  end
  subgraph node [Nœud Hive opérateur]
    AC[/.well-known/agent-card.json]
    MD[/.well-known/hive-mesh.json]
  end
  C -->|1. Résoudre handle| R
  R -->|2. agentCardUrl + meshDescriptorUrl| C
  C -->|3. Appels directs HTTPS| AC
  C --> MD
```

- Le registry **ne proxy pas** le trafic agent dans cette architecture de base.
- **Niveau 0** (sans registry) : chaque instance expose déjà [`hive-mesh-descriptor-v1`](./schemas/hive-mesh-descriptor-v1.schema.json) — le registry est **niveau 1+** agrégation / handles stables.

---

## 6. Exigences fonctionnelles

### 6.1 Endpoints (contrat)

Source normative : [`openapi/registry-v1.yaml`](./openapi/registry-v1.yaml).

| Méthode | Chemin | Usage public | Auth |
|---------|--------|--------------|------|
| `GET` | `/v1/health` | Sondes liveness ; expose drapeaux config (schema, persistence, RL, etc.) | Aucune |
| `GET` | `/v1/metrics` | Scraping Prometheus | Recommandé : `REGISTRY_METRICS_AUTH_SECRET` → Bearer |
| `GET` | `/v1/records` | Liste des handles (catalogue) | Option : `REGISTRY_CATALOG_SECRET` → Bearer |
| `GET` | `/v1/records/{handle}` | Record canonique | Aucune par défaut ; **429** si RL |
| `GET` | `/v1/resolve?agentCardUrl=` | Recherche inverse | **429** si RL — surface d’énumération : à limiter agressivement |
| `POST` | `/v1/records/validate` | **Dry-run** publication : schéma + *publish readiness* (sans stocker) | Même Bearer que `POST /v1/records` |
| `POST` | `/v1/records` | Création / remplacement | **Obligatoire** : `Authorization: Bearer <REGISTRY_WRITE_SECRET>` si écriture activée |
| `DELETE` | `/v1/records/{handle}` | Révocation | Bearer : `REGISTRY_REVOKE_SECRET` si défini, sinon `REGISTRY_WRITE_SECRET` |

### 6.2 Modèle de données record

- **Schéma JSON** : [`schemas/hive-registry-record-v1.schema.json`](./schemas/hive-registry-record-v1.schema.json).
- Champs **obligatoires** : `schema` (= `hive-registry-record-v1`), `handle`, `updatedAt`, `agentCardUrl`.
- Champs **recommandés** pour l’interop Hive : `meshDescriptorUrl`, `capabilities`, `ttlSecondsRecommended`, `publicKeys` (si P5).
- **Marketplace / acheteurs** : `buyerInputs` (liste structurée : `id`, `label`, `kind`, `key` optionnel, `description`, `required`, etc.) ; `documentationUrl`, `sourceUrl`, `pricing`, `publishAttestation` (voir § 6.2.1).
- **Normalisation serveur** (avant validation Ajv) : alias fusionnés — ex. `hiveBuyerInputs` / `buyerConfiguration` / `docsUrl` → champs canoniques du schéma (`services/registry/src/registry-record-normalize.mjs`).
- Exemple minimal valide (sans preuve crypto) : [`services/registry/seed-record.example.json`](../services/registry/seed-record.example.json).

### 6.2.1 Publication contrôlée (*publish readiness*)

Pour que l’éditeur **valide la configuration attendue des déployeurs** avant mise en catalogue :

1. **`POST /v1/records/validate`** — même corps et auth que `POST /v1/records` ; réponse **200** avec `wouldAcceptWrite`, `schemaValid`, `readiness` (issues détaillées), sans écriture.
2. **Variables d’environnement** (stub Node `services/registry`) :
   - `REGISTRY_PUBLISH_READINESS` = `off` (défaut) \| `warn` (log warn) \| `enforce` (**422** sur `POST /v1/records` si erreurs *readiness*).
   - `REGISTRY_PUBLISH_REQUIRE_ATTESTATION=1` — impose `publishAttestation: { confirmedAt, confirmedBuyerConfiguration: true }`.
   - `REGISTRY_PUBLISH_FETCH_AGENT_CARD=1` — GET sur `agentCardUrl` puis recoupe `metadata.hiveAgentManifest` / URL de manifeste avec `runtime.envVarsRequired` vs clés documentées dans `buyerInputs`.
   - `REGISTRY_PUBLISH_AGENT_CARD_TIMEOUT_MS`, `REGISTRY_PUBLISH_MANIFEST_TIMEOUT_MS` — timeouts outbound (défauts 8000 / 6000 ms).
   - `REGISTRY_PUBLISH_ATTESTATION_HMAC_SECRET` — si défini, `publishAttestation.hmacSha256Hex` doit correspondre au HMAC-SHA256 (hex) d’un JSON stable de `{ handle, updatedAt, buyerInputs }` (évite qu’un attesteur ne signe qu’une config vide).
   - `REGISTRY_PUBLISH_FETCH_HOST_ALLOWLIST` — liste d’hôtes séparés par des virgules (comparaison en minuscules) ; si non vide, seuls ces hôtes sont autorisés pour les GET *readiness* (complète le blocage SSRF : IP privées, résolution DNS, pas de redirections illimitées).
   - `REGISTRY_PUBLISH_FETCH_MAX_REDIRECTS` — plafond de redirections HTTP suivies manuellement (défaut 5).
   - `REGISTRY_PUBLISH_FETCH_CACHE_TTL_MS` / `REGISTRY_PUBLISH_FETCH_CACHE_MAX` — cache mémoire des réponses fetch (défauts 60_000 ms / 500 entrées).

Règles métier principales : entrées `buyerInputs` cohérentes (`kind` `env` \| `secret` \| `url` ⇒ `key` obligatoire) ; si `required: true` ⇒ `description` suffisamment explicite ; si manifeste exige `FOO` en env, un item `buyerInputs` doit documenter la clé `FOO` (mode fetch activé).

### 6.3 Comportements HTTP clés

- **ETag faible** + **304** sur `GET /v1/records/{handle}` si `If-None-Match` correspond.
- **412** si `REGISTRY_ENFORCE_IF_MATCH=1` et mise à jour sans bon `If-Match`.
- **409** : preuve Ed25519 invalide (si vérification activée) ou `stale_updatedAt` (si rejet des mises à jour rétrogrades activé).
- **422** `publish_readiness_failed` : `REGISTRY_PUBLISH_READINESS=enforce` et contrôles *buyer configuration* / attestation / manifeste en échec (détails dans le corps JSON `readiness`).
- **410** `record_expired` si `validUntil` dépassé et enforcement lecture activé.
- **403** : écriture désactivée, politique allowlist, ou PDP externe refusé.

### 6.4 Flux opérateur nœud (cible)

1. L’opérateur déploie Hive avec HTTPS et fichiers well-known valides.
2. Il construit un JSON **hive-registry-record-v1** (handle stable choisi selon politique du registry, ex. préfixe `urn:hive:agent:…`).
3. Il authentifie un `POST /v1/records` avec le secret write.
4. Les clients utilisent `GET /v1/records/{handle}` puis appellent l’**origine** du nœud.

---

## 7. Exigences non fonctionnelles

### 7.1 Sécurité

| Sujet | Exigence |
|-------|----------|
| **Transport** | TLS obligatoire en production (reverse proxy ou TLS terminé en amont) ; pas d’exposition **POST** en clair sur Internet |
| **Secrets** | `REGISTRY_WRITE_SECRET` (et `REGISTRY_REVOKE_SECRET` si séparation) : longueur élevée, stockage vault/K8s, rotation documentée |
| **Écriture** | Préférer réseau restreint (VPN, IP allowlist au load balancer) **en plus** du Bearer pour les opérateurs |
| **Lecture** | `REGISTRY_CATALOG_SECRET` si le catalogue complet ne doit pas être enumerable publiquement |
| **Abus** | `REGISTRY_READ_RATE_LIMIT_PER_MIN` et `REGISTRY_WRITE_RATE_LIMIT_PER_MIN` > 0 en prod ; Redis pour multi-réplicas |
| **X-Forwarded-For** | `REGISTRY_RATE_LIMIT_TRUST_XFF=1` **uniquement** si le premier hop est fiable (LB de confiance) |
| **En-têtes** | `REGISTRY_SECURITY_HEADERS=1` recommandé |
| **PDP externe** | `REGISTRY_PDP_HTTP_URL` : décision métier centralisée ; définir `REGISTRY_PDP_FAIL_OPEN` selon tolérance panne |

### 7.2 Disponibilité et données

- **Postgres** : table `hive_registry_records` — **sauvegardes** automatiques + procédure de restauration testée (RPO/RTO à définir).
- **Perte registry** : pas de perte des agents **déjà** configurés côté clients qui cachent les résolutions ; dégradation = pas de nouveaux join / mise à jour globale.
- **Timeout socket** : `REGISTRY_REQUEST_TIMEOUT_MS` recommandé (ex. 30–120 s) pour limiter les connexions lentes.

### 7.3 Performance (ordre de grandeur)

- Charge typique : **lecture** dominante ; viser latence p95 **< 200 ms** sous charge modeste sur VPS correcte avec Postgres local ou managé.
- Taille corps **POST** plafonnée : `REGISTRY_MAX_BODY_BYTES` (défaut 1 Mo).

### 7.4 Observabilité

- Scraper `/v1/metrics` avec auth si secret défini.
- Audit JSON stdout : `REGISTRY_AUDIT_JSON=1` pour corrélation SIEM (ligne par POST/DELETE réussi).

### 7.5 Versioning API et schémas

- Toute évolution du schéma record : bump `$id` ou stratégie de migration documentée dans P1 + [`MESH_PLANETARY_CHANGELOG.md`](./MESH_PLANETARY_CHANGELOG.md).
- CI : `npm run docs:validate-planetary` depuis `app/` ; tests `services/registry` (`npm test`).

### 7.6 Disponibilité : cibles SLO, RPO et RTO

Le registry est une **dépendance de découverte**, pas de données métier temps réel : une indisponibilité **ne coupe pas** les flux déjà établis entre nœuds, mais bloque l’**onboarding**, les **mises à jour d’annuaire** et les **nouvelles résolutions** pour les clients sans cache.

| Niveau | Usage typique | Disponibilité cible (SLO) | Latence p95 lecture (SLO indicatif) | RPO Postgres | RTO service |
|--------|---------------|---------------------------|----------------------------------------|--------------|-------------|
| **Hobby / communauté** | Bootstrap public, peu d’écritures | ≥ **99 %** mensuel (hors maintenance annoncée) | **< 500 ms** sous charge faible | **24 h** (backup quotidien acceptable) | **4 h** (redéploiement manuel) |
| **Production sérieuse** | Référence pour intégrateurs | ≥ **99,5 %** mensuel | **< 200 ms** | **≤ 1 h** (PITR ou snapshots fréquents) | **≤ 1 h** (runbook + redondance LB) |
| **Critique** | Nombreux consommateurs SLA | ≥ **99,9 %** (multi-zone, Postgres managé) | **< 150 ms** | **≤ 15 min** | **≤ 30 min** |

**Indicateurs à monitorer** (à brancher sur Prometheus / alertes) :

- Ratio **5xx** sur `/v1/health` et `/v1/records*` ; taux **429** (abus vs capacité).
- Disponibilité **Postgres** vue depuis le registry (latence requêtes, erreurs connexion).
- Si P4 actif : **échecs de sync** (logs applicatifs) et dérive du catalogue vs pairs.

Les chiffres du tableau sont des **objectifs de cadrage** : l’opérateur les **adapte** au contrat client et les formalise dans son propre document SLA.

### 7.7 Données traitées, classification et privacy (RGPD / bonnes pratiques)

| Catégorie | Exemples dans le registry | Sensibilité typique | Mesures attendues |
|-----------|---------------------------|---------------------|-------------------|
| **Annuaire public** | `handle`, `agentCardUrl`, `meshDescriptorUrl`, `capabilities`, `publicKeys`, champs du schéma record | Souvent **non personnel** si les URLs et handles n’identifient pas une personne physique | Politique de **contenu** (allowlists) ; pas de secrets dans le JSON record |
| **Données potentiellement personnelles** | `author`, texte `description`, handle lisible (email-like), métadonnées métier futures | **Peut** constituer des données personnelles selon le contenu publié par les opérateurs nœud | **Minimisation** : ne publier que le nécessaire ; DPA / contrats avec les **publishers** si registry opéré en tant que responsable/sous-traitant |
| **Journaux et audit** | `REGISTRY_AUDIT_JSON`, logs d’accès LB, traces IP (rate limit) | **Technique** ; peut révéler des comportements ou origines | Durée de **rétention** définie ; accès restreint ; anonymisation si possible pour stats |
| **Secrets opérateur** | `REGISTRY_WRITE_SECRET`, autres Bearer | **Critique** | Vault / secrets manager ; jamais dans les logs ; rotation § 8.5 |

**RGPD (Europe)** : si le registry est exploité auprès de résidents UE et traite des données personnelles (ex. annuaire nominatif), prévoir au minimum : **base légale** et **transparence** (notice), droits d’accès/suppression sur ce que **vous** stockez (records + logs), **DPIA** si volumétrie ou sensibilité élevée, et **transferts hors UE** documentés si Postgres / hébergeur hors zone.

**Principe produit** : garder le record comme **métadonnée de découverte technique** ; éviter d’y stocker identifiants clients finaux, tokens ou PII inutiles.

### 7.8 Escalade et responsabilités (résumé)

| Niveau | Déclencheur | Action |
|--------|-------------|--------|
| **L1** | Health KO, pics 429, lenteur | Vérifier LB, Postgres, Redis (RL), redémarrer instance ; voir § 8.5 |
| **L2** | Corruption / perte données, fuite de secret, abus d’écriture massif | Restauration backup ; **rotation immédiate** des Bearer concernés ; révision allowlists |
| **L3** | Incident sécurité (compromission présumée) | Révoquer secrets, logs forensics, communication selon politique juridique |

Remplir les noms / canaux (PagerDuty, Slack, email) dans la **fiche opérateur interne** référencée au § 10.

---

## 8. Déploiement public (référence)

### 8.1 Topologie minimale recommandée

1. **VPS** ou conteneur (1 instance ou N derrière LB).
2. **PostgreSQL** 14+ (16 recommandé) dédié ou managé.
3. **Reverse proxy** (Caddy, Traefik, nginx, cloud LB) : TLS, HTTP/2, limite taille requêtes, option WAF.
4. **Redis** (optionnel mais **fortement** recommandé si plusieurs réplicas ou LB) pour rate limits cohérents.

### 8.2 Docker

Depuis la racine du monorepo :

```bash
docker build -f services/registry/Dockerfile -t hive-registry:latest .
```

L’image fixe `REGISTRY_RECORD_SCHEMA_PATH=/schemas/hive-registry-record-v1.schema.json` et expose le port **4077** par défaut (`PORT`).

### 8.3 Variables d’environnement (synthèse prod publique)

Liste détaillée et sémantique : [`services/registry/README.md`](../services/registry/README.md).

| Variable | Rôle prod |
|----------|-----------|
| `PORT` | Port d’écoute (souvent 4077 derrière proxy) |
| `REGISTRY_DATABASE_URL` | **Obligatoire** prod : persistance Postgres |
| `REGISTRY_WRITE_SECRET` | Active POST ; secret fort |
| `REGISTRY_REVOKE_SECRET` | *(Optionnel)* Séparer révocation de l’écriture générale |
| `REGISTRY_CATALOG_SECRET` | *(Optionnel)* Restreindre GET catalogue |
| `REGISTRY_READ_RATE_LIMIT_PER_MIN` | **> 0** |
| `REGISTRY_WRITE_RATE_LIMIT_PER_MIN` | **> 0** |
| `REGISTRY_READ_RATE_LIMIT_REDIS_URL` / `REGISTRY_WRITE_RATE_LIMIT_REDIS_URL` | Si multi-réplicas |
| `REGISTRY_METRICS_AUTH_SECRET` | **Recommandé** pour `/v1/metrics` |
| `REGISTRY_POST_HANDLE_PREFIX_ALLOWLIST` | Limite les handles publiables (ex. préfixe communautaire) |
| `REGISTRY_POST_AGENT_CARD_HOST_ALLOWLIST` | Limite les domaines `agentCardUrl` |
| `REGISTRY_VERIFY_ED25519_PROOF` | `1` si tous les records publiés doivent signer le canonique record |
| `REGISTRY_ENFORCE_VALID_UNTIL` / `REGISTRY_REJECT_EXPIRED_WRITES` | Politique d’expiration |
| `REGISTRY_SECURITY_HEADERS` | `1` |
| `REGISTRY_REQUEST_TIMEOUT_MS` | ex. `60000` |

Fédération (si plusieurs registres) : `REGISTRY_SYNC_PEER_BASES`, `REGISTRY_SYNC_INTERVAL_MS`, `REGISTRY_SYNC_AUTH_BEARER`, options de vérification — voir [`MESH_PLANETARY_P4_FEDERATED_SYNC.md`](./MESH_PLANETARY_P4_FEDERATED_SYNC.md).

**Variables complémentaires** (voir README pour la sémantique exacte) :

| Variable | Rôle |
|----------|------|
| `REGISTRY_REJECT_STALE_UPDATES` | Rejette un POST si `updatedAt` recule (**409** `stale_updatedAt`) |
| `REGISTRY_ENFORCE_IF_MATCH` | Mise à jour concurrente sécurisée via en-tête `If-Match` / ETag (**412**) |
| `REGISTRY_PDP_HTTP_URL` | Décision d’écriture déléguée à un PDP HTTP externe |
| `REGISTRY_PDP_HTTP_BEARER` | Bearer optionnel vers le PDP |
| `REGISTRY_PDP_HTTP_TIMEOUT_MS` | Timeout appel PDP (défaut 2000 ms) |
| `REGISTRY_PDP_FAIL_OPEN` | Si `1` : timeout / erreur PDP → autoriser l’écriture (**fail-open**) ; défaut = refus |
| `REGISTRY_VALID_UNTIL_SKEW_SEC` | Tolérance horloge sur `validUntil` |
| `REGISTRY_MAX_URL_BYTES` | Limite longueur ligne de requête (abus / **414**) |
| `REGISTRY_CATALOG_SIGNING_KEY_HEX` / `REGISTRY_CATALOG_SIGNING_KID` | Signature du catalogue (`catalogProof`) pour pairs P4 |
| `REGISTRY_SYNC_VERIFY_ED25519_PROOF` / `REGISTRY_SYNC_VERIFY_CATALOG` / `REGISTRY_SYNC_CATALOG_PUBKEY_HEX` | Durcissement fédération P4 / P5 |

### 8.4 Checklist go-live (extraite et complétée depuis [`MESH_PLANETARY_V1_ADOPTION.md`](./MESH_PLANETARY_V1_ADOPTION.md))

- [ ] Postgres + backups + restauration testée  
- [ ] `REGISTRY_WRITE_SECRET` / révocation ; pas d’exposition POST sans contrôle réseau  
- [ ] TLS + LB de confiance si `TRUST_XFF`  
- [ ] Rate limits lecture/écriture + Redis si réplicas  
- [ ] `/v1/metrics` protégé si exposé  
- [ ] Allowlists alignées avec la politique de noms (handles + domaines)  
- [ ] P4/P5 activés sciemment (sync peers, verify proof, catalog proof)  
- [ ] Smoke post-déploiement : health + GET record + POST test sur staging  
- [ ] SLO / RPO / RTO choisis pour le palier d’exploitation (§ 7.6) documentés en interne  
- [ ] Fiche privacy / rétention logs alignée avec § 7.7 si exposition UE ou PII possible  

### 8.5 Runbook opérationnel (registry)

Procédures **autonomes** pour l’astreinte ; le détail Postgres générique reste dans [`RUNBOOK.md`](./RUNBOOK.md).

#### 8.5.1 Symptômes et diagnostic

| Symptôme | Vérifications rapides |
|----------|------------------------|
| **Tout 502/504** | LB → cible registry ; conteneur/process up ; `GET /v1/health` en direct sur le port interne |
| **Health OK mais 5xx sur GET record** | Postgres : creds `REGISTRY_DATABASE_URL`, disque plein, connexions max ; logs registry |
| **429 généralisé** | Charge réelle vs **rate limit** ; IP derrière un seul NAT (ajuster politique ou Redis) ; `REGISTRY_RATE_LIMIT_TRUST_XFF` cohérent avec le LB |
| **POST refusés 403 policy** | Allowlists `REGISTRY_POST_HANDLE_PREFIX_ALLOWLIST` / `REGISTRY_POST_AGENT_CARD_HOST_ALLOWLIST` ; réponse PDP si `REGISTRY_PDP_HTTP_URL` |
| **P4 : catalogue désynchronisé** | Logs sync ; Bearer `REGISTRY_SYNC_AUTH_BEARER` côté client pull ; `REGISTRY_SYNC_VERIFY_CATALOG` / clés catalogue |
| **Preuve Ed25519 409** | Clé signataire vs `REGISTRY_VERIFY_ED25519_PROOF` ; canonicalisation du record (voir P5) |

#### 8.5.2 Sauvegarde et restauration (Postgres registry)

1. **Backup** : inclure la base pointée par `REGISTRY_DATABASE_URL` (table `hive_registry_records`) dans la politique `pg_dump` / PITR existante — voir [`RUNBOOK.md`](./RUNBOOK.md) § Postgres Backup and Restore.
2. **Restore** : après restore, redémarrer le registry ; vérifier `GET /v1/records/{handle}` sur un handle connu et comparer `updatedAt` à l’attendu.
3. **Test trimestriel** : restauration sur environnement **isolé** + smoke lecture/écriture staging.

#### 8.5.3 Rotation des secrets (sans downtime prolongé)

| Secret | Procédure recommandée |
|--------|------------------------|
| **`REGISTRY_WRITE_SECRET`** | Générer le nouveau secret ; **déployer** sur tous les clients qui font POST (CI, opérateurs) ; basculer la variable sur le serveur ; **fenêtre courte** où ancien + nouveau acceptés **non supportée** par le stub — planifier bascule en quelques minutes. |
| **`REGISTRY_REVOKE_SECRET`** | Idem ; coordonner les outils qui appellent DELETE. |
| **`REGISTRY_CATALOG_SECRET`** | Mettre à jour d’abord les **consommateurs** du catalogue (Bearer), puis le serveur. |
| **`REGISTRY_METRICS_AUTH_SECRET`** | Mettre à jour Prometheus / scrape config puis le registry. |
| **`REGISTRY_SYNC_AUTH_BEARER`** | Pairs P4 : aligner les deux côtés avant expiration de l’ancien. |
| **`REGISTRY_CATALOG_SIGNING_KEY_HEX`** | **Impact P4** : les pairs avec `REGISTRY_SYNC_VERIFY_CATALOG` doivent accepter la nouvelle clé (mise à jour `REGISTRY_SYNC_CATALOG_PUBKEY_HEX` ou procédure de confiance) ; planifier une **fenêtre** où catalogue re-signé et clés à jour. |

Après toute rotation : `GET /v1/health` (vérifier les drapeaux `writeEnabled`, `catalogAuthEnabled`, etc.) + un **POST test** sur staging.

#### 8.5.4 Dégradation contrôlée

- **Maintenance annoncée** : basculer DNS ou LB vers une page statique ; ou laisser le registry répondre **503** au LB uniquement sur chemins non-health si la stack le permet.
- **Incident Postgres** : si lecture seule acceptable, certains déploiements peuvent basculer temporairement en **memory** (non recommandé en prod : perte de cohérence au restart) — **préférer** restore ou failover managé.

---

## 9. Intégration « Marketplace » (vision — hors implémentation obligatoire registry)

Le registry public est le **noyau d’indexation** pour :

- **Location (AaaS)** : le record pointe vers l’agent ; prix, quotas, JWT consommateur peuvent être gérés par **Hive app** ou un **service billing** séparé qui n’a pas besoin de modifier le stub registry jour 1.
- **Vente (package)** : métadonnées « achetable » peuvent être des **extensions** future du schéma **ou** des fiches stockées ailleurs référencées par `handle` / URL dans le record — à spécifier dans un CDC Marketplace dédié.

**Principe** : garder le registry **agnostique** des transactions monétaires pour maximiser adoption et limiter la surface d’attaque.

---

## 10. Critères d’acceptation (Definition of Done — déploiement public)

1. `GET https://registry.example/v1/health` retourne `ok: true` et reflète `persistence: postgres` en prod.  
2. Un record de test validé par Ajv est servi par `GET /v1/records/{handle}`.  
3. `POST /v1/records` refusé sans Bearer correct (**401**/**403**).  
4. Rate limit déclenché observable (429) sous test de charge léger.  
5. Après `DELETE /v1/records/{handle}`, le GET retourne **404**.  
6. Sauvegarde/restauration Postgres : record réapparaît après restore.  
7. Documentation opérateur interne : URLs, secrets (emplacement), procédure rotation, contact on-call.  
8. SLO mensuel et RPO/RTO **écrits** (même si = palier Hobby § 7.6) + chemin des backups Postgres registry.  
9. Si exposition publique UE ou PII possible : référence à la notice / traitement des données (§ 7.7).

---

## 11. Références croisées

| Document | Contenu |
|----------|---------|
| [`services/registry/README.md`](../services/registry/README.md) | Variables complètes, Docker, tests |
| [`MESH_PLANETARY_P1_GLOBAL_DIRECTORY.md`](./MESH_PLANETARY_P1_GLOBAL_DIRECTORY.md) | Spec P1 courte |
| [`MESH_PLANETARY_P4_FEDERATED_SYNC.md`](./MESH_PLANETARY_P4_FEDERATED_SYNC.md) | Sync entre registres |
| [`MESH_PLANETARY_P5_TRUST_PROOF.md`](./MESH_PLANETARY_P5_TRUST_PROOF.md) | Ed25519 `proof` |
| [`MESH_PLANETARY_DEV_STACK.md`](./MESH_PLANETARY_DEV_STACK.md) | Stack locale / Compose profile `planetary` |
| [`MESH_PLANETARY_V1_ADOPTION.md`](./MESH_PLANETARY_V1_ADOPTION.md) | Risques, checklist prod planétaire, smoke |
| [`RUNBOOK.md`](./RUNBOOK.md) | Backup/restore Postgres générique, rotations tokens Hive |
| [`THREAT_MODEL.md`](./THREAT_MODEL.md) | Surface d’attaque et mitigations (contexte) |
| [`openapi/registry-v1.yaml`](./openapi/registry-v1.yaml) | Contrat OpenAPI 3.1 |

---

## 12. Historique du document

| Version | Date | Auteur / note |
|---------|------|----------------|
| 1.0 | 2026-03-21 | CDC initial — aligné sur l’implémentation `services/registry` et les docs planétaires du repo |
| 1.1 | 2026-03-22 | Compléments : SLO/RPO/RTO (§ 7.6), privacy/RGPD (§ 7.7), escalade (§ 7.8), variables d’env étendues (§ 8.3), runbook opérationnel (§ 8.5), DoD et références élargies |
