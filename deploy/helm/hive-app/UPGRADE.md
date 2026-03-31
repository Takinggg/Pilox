# hive-app — upgrade checklist

1. **Images** — bump `image.tag` in your values; pull policy `IfNotPresent` or pin by digest in production.
2. **Migrations** — run Drizzle / SQL migrations against Postgres **before** rolling out pods that expect the new schema (job or init container).
3. **Secrets** — rotate `database-url`, `redis-url`, `auth-secret`, `encryption-key` via your secret manager; redeploy so pods remount.
4. **Session / MFA** — changing `AUTH_SECRET` invalidates cookies; users with MFA must complete TOTP again after Redis MFA gate TTL if you clear Redis.
5. **Replicas** — scale with HPA after setting resource requests; ensure sticky sessions or shared session store if you run multiple app replicas behind a load balancer.
6. **Helm** — `helm diff upgrade` (plugin) then `helm upgrade --install` with frozen `values` file; keep `Chart.lock` committed when using subcharts.

For Docker Compose HA reference, see `docker/docker-compose.ha.yml` at the repo root.
