# Pilox (Next.js application)

Self-hosted AI agent operating system — dashboard, API routes, Postgres, Redis, optional Firecracker VMs.

## New here?

**Dev local :** [../docs/GETTING_STARTED.md](../docs/GETTING_STARTED.md) — `.env.local`, Docker, migrations, seed.

**Serveur / production :** [../docs/SERVER_INSTALL.md](../docs/SERVER_INSTALL.md) (fr) — Compose prod, domaine, TLS, `/setup`.

The rest of this file is a **compact reference** while you work inside `app/`.

## Architecture

- **Frontend**: Next.js + React + Tailwind CSS
- **Backend**: Next.js API routes + Drizzle ORM + PostgreSQL 16
- **Isolation**: Firecracker microVMs when Docker + KVM are available (optional for first install)
- **Cache / pub-sub**: Redis 7
- **Auth**: NextAuth (JWT) + API tokens (Bearer)
- **Billing (optional)**: Stripe webhooks (`POST /api/webhooks/stripe`), wallet (`GET /api/billing/wallet`), ledger (`GET /api/billing/ledger`), Checkout (`POST /api/billing/stripe/checkout-session`), Customer Portal (`POST /api/billing/stripe/customer-portal`) — see [../docs/PRODUCTION.md](../docs/PRODUCTION.md) (section 2.1)

## Quick reference (from `app/`)

**Prerequisites:** Node 22+, Docker (recommended).

```bash
# Infrastructure (Postgres + Redis) — run inside app/
docker compose up -d postgres redis

npm install
cp .env.example .env.local
# Edit .env.local — see docs/GETTING_STARTED.md § Minimal environment

npm run db:migrate:run
npm run db:seed
npm run dev
```

Open **http://localhost:3000** — **admin** / `ADMIN_PASSWORD`.

**One-liner infra:** `npm run mesh:infra` (Postgres + Redis only).

### Mesh / A2A (same instance, no planetary stack)

See [docs/MESH_V1_REDIS_BUS.md](../docs/MESH_V1_REDIS_BUS.md) and [docs/A2A_INTEGRATION.md](../docs/A2A_INTEGRATION.md). UI: **Settings → A2A / mesh**.

### Optional: planetary stubs (NATS + registry + gateway + bridge)

[docs/MESH_PLANETARY_DEV_STACK.md](../docs/MESH_PLANETARY_DEV_STACK.md) — TL;DR first. Smoke: `npm run smoke:planetary`.

### Production (Docker)

Production compose lives under **`docker/`** at the repo root (not inside `app/`). See [docs/PRODUCTION.md](../docs/PRODUCTION.md) and [docker/docker-compose.prod.yml](../docker/docker-compose.prod.yml).

```bash
# From repository root
docker compose -f docker/docker-compose.prod.yml --profile … up -d
```

(Exact profiles and env files are documented in PRODUCTION.md.)

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | NextAuth secret (≥ 32 chars) |
| `AUTH_URL` | Yes | Public URL of the app |
| `ENCRYPTION_KEY` | Yes | 64-char hex (32 bytes) for AES-256-GCM |
| `REDIS_URL` | No | Default `redis://localhost:6379` |
| `ADMIN_PASSWORD` | No | Initial admin password for `db:seed` |

Full list and comments: **[.env.example](./.env.example)** (large file — use **GETTING_STARTED** for the small set).

## Scripts

```bash
npm run dev              # Development server
npm run build            # Production build
npm run start            # Production server
npm run lint             # ESLint
npm run typecheck        # TypeScript check
npm run test             # Tests
npm run db:migrate:run   # Run migrations
npm run db:seed          # Seed admin user
npm run db:studio        # Drizzle Studio
npm run mesh:infra       # Docker: postgres + redis only
npm run docs:validate-planetary   # Parse OpenAPI/schemas under docs/
npm run smoke:planetary  # HTTP smoke (stubs must be running)
npm run load:smoke       # Latency smoke against BASE_URL (default http://127.0.0.1:3000)
npm run test:e2e         # Playwright (seed admin + E2E_MFA_SECRET in CI after e2e:prepare-mfa; see e2e/helpers/login.ts)
npm run e2e:prepare-mfa  # Enable TOTP on seed admin for E2E (E2E_MFA_SECRET base32, DATABASE_URL, ENCRYPTION_KEY)
```

**E2E MFA:** set `E2E_MFA_SECRET` (base32, e.g. 32 chars A–Z234567), run `npm run e2e:prepare-mfa` after migrate/seed. CI may use a documented test secret; local runs should use your own.

**Observability / alerts (production):** Prometheus rule examples for HTTP P99 and 5xx spikes live in [../docs/observability/ALERTING.md](../docs/observability/ALERTING.md) and [../docs/observability/prometheus-rules.pilox.yml](../docs/observability/prometheus-rules.pilox.yml). Wire **Alertmanager** (or your platform alerting) for notifications — see [../docs/observability/ALERTING.md](../docs/observability/ALERTING.md).

**Dependencies:** run `npm audit` regularly; address what `npm audit fix` can without breaking upgrades. Typical remaining **moderate** items are dev-time only: **eslint** / **minimatch** (brace-expansion advisory) and **drizzle-kit**’s older **esbuild**; clearing them often needs major bumps (`npm audit fix --force`), so document accepted risk until upstream releases land.

**CLI log prefix:** maintenance scripts under `scripts/` and CI checks print **`[pilox]`** (or **`[pilox:registry]`** / **`[pilox:marketplace]`** in `Pilox market-place/`) so logs are easy to grep. The mesh WAN worker in **`log`** mode still emits **one JSON object per line** on stdout for pipelines (no prefix on those lines).

## Marketplace V2 (scaling)

- **Standalone Node bundle:** `Pilox market-place/` — registry + marketplace services (`npm run check`, `npm test`). Validated on every PR in CI (**Pilox marketplace (Node)**).
- **DB index:** migration `0008_marketplace_catalog_rows`, `npm run marketplace:index-sync`, operator **`POST /api/marketplace/index-rebuild`**.
- **Read path:** `MARKETPLACE_CATALOG_SOURCE=db` (see `.env.example`); empty index falls back to live Redis build.
- **UI:** paginated `/api/marketplace` + infinite scroll on `/marketplace`.
- **E2E:** authenticated flows use the seed admin (`E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`, defaults match `db:seed`) and **`E2E_MFA_SECRET`** after `npm run e2e:prepare-mfa` (see `e2e/helpers/login.ts`) → `npm run test:e2e` (Playwright). Details: [../docs/MARKETPLACE_V2_SCALING.md](../docs/MARKETPLACE_V2_SCALING.md).

## Agents list API (dashboard)

`GET /api/agents` supports `limit`, `offset`, optional `sourceType` (`local` \| `url-import` \| `marketplace` \| `registry`), and optional **`q`** (case-insensitive match on name and image; used by **Agents** search with debounce).

## Project structure (short)

```
app/
  src/app/          # Routes (dashboard, api, auth)
  src/lib/          # Core libraries (env, redis, mesh, a2a, …)
  drizzle/          # SQL migrations
  scripts/          # Operational scripts
  docker-compose.yml
```

## Security & backups

RBAC, rate limits, audit logging — see dashboard **Security** and [docs/THREAT_MODEL.md](../docs/THREAT_MODEL.md). Backups: [docs/RUNBOOK.md](../docs/RUNBOOK.md) and `scripts/` where present.

## License

See [LICENSE](../LICENSE) at repository root (BSL 1.1).
