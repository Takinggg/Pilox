# Getting started with Hive

**Single entry point** for new operators and contributors. You do **not** need external SaaS, mesh, or microVMs to run the **dashboard and API** on your machine.

---

## 1. What you are installing (choose your path)

| Path | What runs | External services |
|------|-----------|-------------------|
| **A — Hive core (recommended first)** | Next.js app + Postgres + Redis | None beyond Docker (or your own DB/Redis). |
| **B — A2A / mesh v1 (same instance)** | Same as A + Redis channels for agents | Still no planetary stack. |
| **C — Planetary (mesh WAN stubs)** | NATS + registry + gateway + bridge + subscriber (+ Hive) | **Docker Desktop tout-en-un** : `docker/docker-compose.local.yml` démarre aussi la stack planetary sur `hive-network` (après Postgres depuis `app/docker-compose.yml`). **Racine** : `docker compose up -d --build` lance NATS + stubs (Hive sur l’hôte ou autre compose). [MESH_PLANETARY_DEV_STACK.md](./MESH_PLANETARY_DEV_STACK.md), [MESH_WAN_COMPLETE_DEPLOYMENT.md](./MESH_WAN_COMPLETE_DEPLOYMENT.md). |

**Firecracker / KVM** is for **per-agent microVM isolation**. Many features work without it; the UI may hide or degrade VM-specific actions until Docker+KVM is available. Do not block your first install on Linux+KVM.

---

## 2. Prerequisites

- **Node.js** ≥ 22 (see `engines` in `app/package.json`).
- **Docker** + **Docker Compose** (recommended) *or* PostgreSQL 16+ and Redis 7+ installed yourself.
- **Git**.

**Windows:** use PowerShell; for env vars use `$env:VAR="value"`. Docker Desktop must be running.

---

## 3. Minimal environment (copy-paste)

Create `app/.env.local` (never commit it). These values match the **default** `app/docker-compose.yml` Postgres/Redis.

```bash
# Database (default Docker Compose credentials)
DATABASE_URL=postgres://hive:hive_secret@localhost:5432/hive

# Auth — AUTH_SECRET must be ≥ 32 characters
AUTH_SECRET=change-me-to-a-long-random-string-at-least-32-chars
AUTH_URL=http://localhost:3000

# Encryption — exactly 64 hex characters (32 bytes). Generate a fresh one:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000

# Redis
REDIS_URL=redis://localhost:6379

# First admin password (used by db:seed)
ADMIN_PASSWORD=changeme

# Docker API — optional. On Windows + Docker Desktop, omit DOCKER_HOST (Hive uses the named pipe by default).
# Linux/macOS non-default socket only:
# DOCKER_HOST=/var/run/docker.sock
```

**Before first run:** replace `ENCRYPTION_KEY` with output from the `node -e` one-liner above. Replace `AUTH_SECRET` with a long random string.

**Windows:** do **not** set `DOCKER_HOST` to `unix:///var/run/docker.sock` — leave it unset unless you use a remote engine.

The full variable catalog (federation, public A2A, OTel, …) is in [`app/.env.example`](../app/.env.example) — you can ignore almost all of it until you need those features.

---

## 4. First run (development) — from repository root

All commands below assume you cloned the repo and your current directory is the **`Hive/`** root (the folder that contains `app/` and **`packages/a2a-sdk/`**). Do not use a sparse checkout without the SDK — `npm install` in `app/` and the **production Docker image** both need that path.

### 4.1 Start Postgres and Redis

```bash
cd app
docker compose up -d postgres redis
```

Wait until both are healthy (`docker compose ps`).

### 4.2 Install dependencies

```bash
cd app
npm install
```

The monorepo may build the local A2a SDK during `npm run build`; for dev, `npm install` in `app/` is enough.

### 4.3 Configure env

```bash
cp .env.example .env.local
```

Edit `.env.local`: set at least the **minimal** block in §3 (especially `ENCRYPTION_KEY` and `AUTH_SECRET`). After `cp .env.example`, you do **not** need to uncomment `DOCKER_HOST` on Windows — defaults match Docker Desktop.

### 4.4 Database migrations and admin user

```bash
npm run db:migrate:run
npm run db:seed
```

### 4.5 Start the app

```bash
npm run dev
```

- Open **http://localhost:3000**
- Log in with **admin** and the password from `ADMIN_PASSWORD` in `.env.local`.

### 4.6 Quick sanity checks

- **Public health (load balancers):** `curl -sS http://localhost:3000/api/health` — expect `200` (shallow check; deep check is optional via env, see [PRODUCTION.md](./PRODUCTION.md)).
- **Authenticated system health:** after login, `GET /api/system/health` (viewer+) — Postgres + Redis + Docker status.

---

## 5. Shorter variant: `mesh:infra`

From `app/`, you can start only Postgres + Redis with:

```bash
npm run mesh:infra
```

Then continue from §4.2 (same `app/` directory).

---

## 6. Optional: A2A on the same instance

Redis + Postgres are enough for **v1** JSON-RPC and tasks. Configure Agent Card / JSON-RPC in the UI (**Settings → A2A / mesh**) and read [A2A_INTEGRATION.md](./A2A_INTEGRATION.md).

---

## 7. Planetary stack (NATS + stubs)

Not required for **minimal** Hive (dashboard + agents), but **included** in `docker/docker-compose.local.yml` so un `docker compose … up` côté `docker/` installe aussi planetary. À la **racine** du dépôt : `docker compose up -d --build` suffit pour NATS + registry + gateway + bridge + subscriber (Hive sur l’hôte en `npm run dev` ou via compose local).

When you are ready to dig in:

1. Read [MESH_PLANETARY_PRODUCT.md](./MESH_PLANETARY_PRODUCT.md) (scope).
2. Follow the **TL;DR** in [MESH_PLANETARY_DEV_STACK.md](./MESH_PLANETARY_DEV_STACK.md).
3. From `app/`: `npm run smoke:planetary` after services are up.

Production-style checklist: [MESH_PLANETARY_V1_ADOPTION.md](./MESH_PLANETARY_V1_ADOPTION.md).

---

## 8. Production

- **[SERVER_INSTALL.md](./SERVER_INSTALL.md) (fr)** — **installer Hive sur un serveur** : Docker Compose prod, DNS, Let’s Encrypt, wizard `/setup`, migrations, dépannage.
- [PRODUCTION.md](./PRODUCTION.md) — TLS, env, health, security (référence détaillée).
- [docker/docker-compose.prod.yml](../docker/docker-compose.prod.yml) — stack Traefik + app + Postgres + Redis.

---

## 9. Troubleshooting

| Symptom | What to check |
|---------|----------------|
| `ECONNREFUSED` on DB | `docker compose ps` in `app/` — Postgres on `5432`. `DATABASE_URL` host/port. |
| `ECONNREFUSED` Redis | Redis on `6379`, `REDIS_URL`. |
| Auth / env validation errors | `AUTH_SECRET` length ≥ 32; `ENCRYPTION_KEY` exactly 64 hex chars; `AUTH_URL` matches how you open the app (e.g. `http://localhost:3000`). |
| Migration errors | Postgres version 16+, empty or compatible DB; run `npm run db:migrate:run` from `app/`. |
| Cannot log in after seed | Re-run `npm run db:seed` or reset DB and migrate again; confirm `ADMIN_PASSWORD`. |
| Docker errors from the UI / API on **Windows** | Ensure Docker Desktop is running; leave `DOCKER_HOST` unset or set `DOCKER_HOST=//./pipe/docker_engine`. Do **not** use `unix:///var/run/docker.sock` on Windows. |
| **`GET /api/system/health`** shows Firecracker / Cloud Hypervisor **unhealthy** (KVM) | Expected without `/dev/kvm` (Windows, macOS, many VPS without nested virt). Response is still **HTTP 200** with top-level **`status`: `degraded`** when Docker, Postgres, and Redis are OK; microVM creation needs Linux + KVM. |

---

## 10. Where to go next

| Goal | Document |
|------|----------|
| Operations / incidents | [RUNBOOK.md](./RUNBOOK.md) |
| Federation between Hive instances | [MESH_FEDERATION_RUNBOOK.md](./MESH_FEDERATION_RUNBOOK.md) |
| Security | [THREAT_MODEL.md](./THREAT_MODEL.md) |
| Doc index | [docs/README.md](./README.md) |
| App-only details | [app/README.md](../app/README.md) |

---

## 11. Contributing / CI

After changing code: from `app/`, run `npm run lint`, `npx tsc --noEmit`, `npm test` as appropriate. Planetary OpenAPI/schemas: `npm run docs:validate-planetary`. See [.github/CONTRIBUTING.md](../.github/CONTRIBUTING.md).

### 11.1 End-to-end tests (Playwright)

From `app/` with **Postgres + Redis** up, migrations applied, and **`npm run db:seed`** (same env as § 3 — at minimum `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `ENCRYPTION_KEY`):

1. **Optional MFA (matches CI):** set `E2E_MFA_SECRET` to a base32 string (16+ chars, e.g. from `otplib` / RFC 4648 alphabet), then run `npm run e2e:prepare-mfa` so the seed admin has TOTP enabled. Without this step, E2E still works if the admin user has MFA off.
2. **Start the app** in another terminal: `npm run dev` (locally, Playwright does not auto-start the server unless `CI=true`).
3. Install the browser once: `npx playwright install chromium`.
4. Run: `npm run test:e2e`.

Authenticated specs use **`e2e/helpers/login.ts`** (`E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`, defaults align with seed). If MFA is on, **`E2E_MFA_SECRET`** must match what you passed to `e2e:prepare-mfa`. See [`app/README.md`](../app/README.md) for script names and CI behaviour.

Dataset maintenance scripts that clone third-party repos document their paths in **`app/AGENTS.md`** (`LANGFLOW_CLONE_DIR`, `MASTRA_CLONE_DIR`).
