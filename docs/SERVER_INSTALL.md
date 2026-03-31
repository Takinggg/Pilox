# Installer Hive sur un serveur (production)

Ce guide est pour **déployer Hive sur une machine ou un VPS** (Linux), pas pour le dev local sur ton laptop. Pour un premier essai en local, voir [GETTING_STARTED.md](./GETTING_STARTED.md).

---

## 1. Ce que tu installes

- **Application** : Next.js (dashboard + API) — conteneur `hive-app` ou process Node derrière un reverse proxy.
- **Données** : PostgreSQL + Redis (souvent dans le même Compose).
- **TLS** : en production, le dépôt fournit un exemple avec **Traefik** + **Let’s Encrypt** (`docker/docker-compose.prod.yml`).

Tu n’as **pas** besoin de services SaaS externes pour une install standard.

---

## 2. Prérequis côté serveur

| Élément | Détail |
|---------|--------|
| **OS** | Linux x86_64 (recommandé) ; Docker Engine + Compose plugin |
| **RAM** | Mini **2 Go** pour tester ; **4 Go+** confortable avec Postgres + Redis + app |
| **Disque** | Images Docker + données Postgres (prévoir marge) |
| **DNS** | Un **nom de domaine** (ex. `hive.example.com`) pointant vers l’IP publique du serveur — **obligatoire** pour Let’s Encrypt HTTP-01 |
| **Ports** | **80** et **443** ouverts vers Traefik (ACME) ; **22** SSH selon ta politique |
| **Docker** | Accès au socket Docker si tu utilises les agents / VMs (`/var/run/docker.sock` monté en lecture seule dans l’exemple prod) |

**MicroVMs Firecracker** : optionnel ; beaucoup de fonctions marchent sans KVM. Voir [PRODUCTION.md](./PRODUCTION.md).

---

## 3. Méthode recommandée : Docker Compose « prod »

### 3.1 Récupérer le code

Sur le serveur :

```bash
git clone https://github.com/Takinggg/Hive.git
cd Hive/docker
```

### 3.2 Fichier d’environnement

```bash
cp .env.example .env
chmod 600 .env
```

Renseigne au minimum (voir `docker/.env.example`) :

| Variable | Rôle |
|----------|------|
| `HIVE_DOMAIN` | Nom DNS public (ex. `hive.example.com`) |
| `AUTH_URL` | URL canonique **HTTPS** (ex. `https://hive.example.com`) — doit coller à ce que les navigateurs utilisent |
| `POSTGRES_PASSWORD` | Mot de passe fort pour Postgres |
| `AUTH_SECRET` | Secret NextAuth — **≥ 32 caractères** aléatoires |
| `ENCRYPTION_KEY` | **64 caractères hex** (32 octets) — génère avec : `openssl rand -hex 32` |
| `ACME_EMAIL` | Email Let’s Encrypt (notifications) |

### 3.3 Durcissement (recommandé avant Internet)

- **`HIVE_SETUP_TOKEN`** — **≥ 32 caractères** : l’assistant **`/setup`** et `POST /api/setup` peuvent exiger ce jeton (voir [PRODUCTION.md](./PRODUCTION.md) §5).
- **`ALLOW_PUBLIC_REGISTRATION=false`** — invitations admin uniquement : ajoute la variable sur le service **`hive-app`** dans un fichier `docker-compose.override.yml` ou étends `docker-compose.prod.yml` (elle n’est pas dans l’exemple minimal `docker/.env.example`).

### 3.4 Lancer la stack

Toujours depuis `Hive/docker` :

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

L’image **`hive-app`** se construit avec le **contexte à la racine du dépôt** (`..`) pour inclure `packages/a2a-sdk` (dépendance `file:`). Un `docker build -f app/Dockerfile` manuel se fait donc depuis **`Hive/`**, pas depuis `app/` seul.

La première build peut prendre plusieurs minutes.

### 3.5 Vérifications immédiates

```bash
curl -sS "https://$HIVE_DOMAIN/api/health"
```

Tu dois obtenir une réponse JSON avec `"ok": true` (éventuellement enrichie si `HEALTH_CHECK_DEEP=true` sur l’app).

**Important** : les sondes **load balancer** et les **HEALTHCHECK** Docker doivent utiliser **`GET /api/health`** (sans auth), pas `/api/system/health` (réservé aux utilisateurs connectés **viewer+**).

### 3.6 Premier administrateur (onboarding dans le navigateur)

1. Ouvre **`https://<HIVE_DOMAIN>/setup`**.
2. Si `HIVE_SETUP_TOKEN` est défini : saisis le **jeton de setup** dans l’assistant.
3. Suis les étapes (compte admin, instance, réseau, etc.) — l’UI appelle `POST /api/setup`.
4. À la fin : connexion sur **`/auth/login`**.

Si tu préfères **sans wizard** : tu peux utiliser le **seed** en dev ; en prod, le flux documenté reste **`/setup`** + `POST /api/setup` (voir code `app/src/app/setup/`).

---

## 4. Migrations base de données

Les fichiers SQL sont dans **`app/drizzle/`**.

**Comportement par défaut (Compose prod)** : au démarrage du conteneur **`hive-app`**, un script d’entrée exécute les migrations (**`migrate.cjs`**, bundle généré au build) **avant** `node server.js`, tant que **`DATABASE_URL`** est défini. Compose attend déjà Postgres **healthy** avant de lancer l’app.

- **`HIVE_SKIP_MIGRATE=1`** — désactive ce pas (ex. tu lances les migrations ailleurs : CI, job Kubernetes one-shot, base externe gérée par ton équipe). Tu peux passer la variable dans l’environnement du service ou dans ton `.env` utilisé par Compose.

**Sans Docker** (dépôt sur une machine, CI, ou accès direct au Postgres) :

```bash
cd Hive/app
export DATABASE_URL="postgresql://USER:PASSWORD@IP_OU_HOST:5432/hive"
npm ci
npm run db:migrate:run
```

**Plusieurs réplicas** de la même image : évite que chaque pod lance les migrations en parallèle — utilise un job init dédié + **`HIVE_SKIP_MIGRATE=1`** sur les réplicas applicatifs.

Détails : [PRODUCTION.md](./PRODUCTION.md) §5.

---

## 5. Après l’installation

| Sujet | Document |
|-------|----------|
| Sauvegardes, incidents, rotation des secrets | [RUNBOOK.md](./RUNBOOK.md) |
| Variables complètes, TLS, sécurité | [PRODUCTION.md](./PRODUCTION.md) |
| Observabilité (profil OTel + Prometheus + Tempo) | [PRODUCTION.md](./PRODUCTION.md) §9, [observability/README.md](./observability/README.md) |
| Mesh / fédération (optionnel) | [MESH_FEDERATION_RUNBOOK.md](./MESH_FEDERATION_RUNBOOK.md) |
| Stack planétaire (NATS, stubs) | [MESH_PLANETARY_DEV_STACK.md](./MESH_PLANETARY_DEV_STACK.md) (adaptation serveur : mêmes services, autres hôtes/ports) |

---

## 6. Profil observabilité (optionnel)

```bash
cd Hive/docker
docker compose -f docker-compose.prod.yml --profile observability up -d
```

Prometheus et Tempo restent sur le **réseau interne** Docker ; l’UI Hive **`/observability`** utilise **`PROMETHEUS_OBSERVABILITY_URL`** et **`TEMPO_OBSERVABILITY_URL`**. Voir [observability/README.md](./observability/README.md) et [PRODUCTION.md](./PRODUCTION.md) §9.

---

## 7. Dépannage express

| Problème | Piste |
|----------|--------|
| Let’s Encrypt échoue | DNS A/AAAA vers la bonne IP ; ports 80/443 ; pas de pare-feu bloquant l’HTTP depuis Internet |
| 502 / app ne répond pas | `docker compose logs hive-app` ; Postgres/Redis `healthy` ? `AUTH_URL` = URL publique réelle |
| Setup refuse le token | `HIVE_SETUP_TOKEN` identique dans l’env du conteneur `hive-app` ; redémarrage après changement |
| Health Docker « unhealthy » | Doit pointer sur **`/api/health`** (corrigé dans le dépôt si tu es à jour) |

---

## 8. Install sans Docker (avancé)

Node 22, Postgres, Redis, build `npm run build`, `npm run start`, TLS sur **nginx / Caddy / Traefik** en frontal — mêmes variables que [PRODUCTION.md](./PRODUCTION.md). Plus de maintenance manuelle ; Compose prod reste la référence du dépôt.
