# Hive — Operational Runbook

Short procedures for operations. Product context: [`PRODUCTION.md`](./PRODUCTION.md).

---

## Incident: App Not Responding

1. Check **`GET /api/health`** (LB) — 200 expected; if `HEALTH_CHECK_DEEP=true`, a **503** usually indicates Postgres.
2. Check **Redis**: rate limiting fails **closed** if Redis is down (login / sensitive routes may reject requests).
3. Review application logs (`LOG_LEVEL`, JSON output in production).

---

## Incident: No One Can Log In

1. Redis unavailable → rate limit may block; restore Redis or temporarily reduce load on the instance (per policy).
2. `AUTH_SECRET` changed without coordination → all sessions invalidated; users must log in again.
3. Verify `AUTH_URL` matches the actual URL (CORS / cookies).

---

## Creating an Admin When All Access Is Lost

1. **Console** or **SQL** access to Postgres: insert/modify a user and a bcrypt hash (not documented here — prefer a secure internal procedure).
2. Or restore a previous Postgres **backup** (see below).
3. Prevention: keep at least one **admin API token** in a vault, or a documented break-glass procedure.

---

## Postgres Backup and Restore (Manual)

Adapt to your infrastructure; indicative schema:

```bash
# Backup
pg_dump "$DATABASE_URL" -Fc -f hive_$(date +%Y%m%d).dump

# Restore (destructive on the target database)
pg_restore -d "$DATABASE_URL" --clean --if-exists hive_YYYYMMDD.dump
```

**Backups via the Hive API** (files under `BACKUP_DIR`) supplement but do not necessarily replace a full DB strategy.

---

## `ENCRYPTION_KEY` Rotation

1. Encrypted records in the database (secrets, etc.) use the current key.
2. To rotate: decrypt with the old key, re-encrypt with the new one, or provision a new instance and migrate data in controlled cleartext.
3. **Do not** change `ENCRYPTION_KEY` without a plan — existing ciphertexts will become unreadable.

---

## `HIVE_INTERNAL_TOKEN` Rotation

1. Generate a new long random value.
2. Deploy the same value to **all** services that call the API with this token.
3. Restart within a short window to avoid intermittent 401 errors.

---

## Federated Mesh (Multiple Hive Instances)

Pairing procedure, test curls, and secret rotation: **[`MESH_FEDERATION_RUNBOOK.md`](./MESH_FEDERATION_RUNBOOK.md)**.

---

## Post-Deployment Checks

- [ ] `GET /api/health` → 200
- [ ] UI login + one authenticated API route (e.g. agent list)
- [ ] Redis and Postgres reachable from the container / host
- [ ] If Firecracker: health via `/api/system/health` (authenticated)
