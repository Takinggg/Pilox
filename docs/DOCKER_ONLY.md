# Hive — Docker-only deployment (authoritative)

Hive is intended to run **100% via Docker** (Compose / Kubernetes).

## What you need

- `hive-app` (Next.js dashboard + API)
- PostgreSQL
- Redis
- A reverse proxy / TLS termination (Traefik/nginx/Caddy/LB) for production

## What you do NOT need

- Anything under `os/` (optional appliance layer). You can ignore it entirely for Docker-only deployments.

## Where to start

- **Local dev:** `docs/GETTING_STARTED.md`
- **Server / production (Compose):** `docs/SERVER_INSTALL.md`
- **Deep production reference:** `docs/PRODUCTION.md`
- **Config model (env vs dashboard runtime config):** `docs/OPERATOR_CONFIG.md`

