# Operator configuration: env vs dashboard runtime config

Hive has **two** configuration layers:

1. **Environment variables** (deployment-time) — `app/.env.*`, Docker Compose env, or Kubernetes secrets/configmaps.
2. **Runtime config overrides** (dashboard, admin-only) — stored in Postgres and applied without redeploy.

This doc explains when to use which.

---

## 1) Use environment variables for secrets and boot-critical settings

Keep these in **env**, not in the dashboard:

- **Secrets / keys**: `AUTH_SECRET`, `ENCRYPTION_KEY`, `HIVE_INTERNAL_TOKEN`, Stripe secrets, etc.
- **Connectivity**: `DATABASE_URL`, `REDIS_URL`.
- **Public canonical URL**: `AUTH_URL` (also used as a default allowed origin for some CORS decisions).
- **“Day-0” bootstrap controls**: `HIVE_SETUP_TOKEN`, etc.

### Docker / Compose locations

- **Docker Compose**: `docker/.env` (or your CI/CD secrets), plus `environment:` in your `docker-compose.*.yml`.
- **Kubernetes**: ConfigMaps for non-secrets + Secrets for secrets.

Hive also contains an optional appliance layer under `os/`, but **the product deploy path is Docker**. This doc assumes Docker/Compose/Kubernetes.

---

## 2) Use dashboard runtime config for safe toggles and URLs

If you are an **admin**, go to:

- **Dashboard → Settings → Runtime config**

Runtime config is meant for values that:

- Are **not secrets**
- You may need to adjust quickly (ops)
- Should apply across replicas (Hive publishes a Redis invalidation so other instances refresh)

Typical examples:

- Client IP parsing mode (behind proxies)
- Observability URLs (Prometheus / Tempo)
- Selected marketplace/transparency behaviors
- Safety limits (redirect limits, etc.)

---

## 3) Marketplace transparency: what is editable where

### Public verify endpoint

- **Env key**: `HIVE_MARKETPLACE_VERIFY_PUBLIC`
- **What it does**: allows unauthenticated `GET /api/marketplace/<handle>/verify` (still IP rate-limited).
- **Where to change**: env or runtime config.

### Browser CORS origins (static sites like Firebase)

- **Env key**: `HIVE_MARKETPLACE_CORS_ORIGINS` (comma-separated list)
- **What it does**: adds CORS headers on the transparency routes:
  - `GET/OPTIONS /api/marketplace/<handle>/verify`
  - `GET/OPTIONS /api/marketplace/catalog-export`
- **Where to change**: env or runtime config.

Important nuance:

- For these **transparency** routes, the API handlers answer preflight (`OPTIONS`) and can use DB-backed runtime config.
- For **other** `/api/*` routes, global middleware CORS behavior is still primarily env-driven.

See in-app docs: **`/docs/marketplace-transparency`**.

---

## 4) Rule of thumb

- If changing it could leak money or data: **env**.
- If it’s a harmless toggle / URL / limit you may tune often: **dashboard runtime config**.

