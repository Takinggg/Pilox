#!/bin/sh
set -e

# ── Fix Docker socket permissions for agent runtime ──
# The mounted Docker socket may be owned by a GID that nextjs doesn't have.
# Create a matching group and add nextjs to it.
DOCKER_SOCK="/var/run/docker.sock"
if [ -S "$DOCKER_SOCK" ]; then
  SOCK_GID=$(stat -c '%g' "$DOCKER_SOCK" 2>/dev/null || stat -f '%g' "$DOCKER_SOCK" 2>/dev/null || echo "")
  if [ -n "$SOCK_GID" ] && [ "$SOCK_GID" != "0" ]; then
    # Create a group with the socket's GID if it doesn't exist
    if ! getent group "$SOCK_GID" >/dev/null 2>&1; then
      addgroup --system --gid "$SOCK_GID" dockersock 2>/dev/null || true
    fi
    SOCK_GROUP=$(getent group "$SOCK_GID" | cut -d: -f1)
    addgroup nextjs "$SOCK_GROUP" 2>/dev/null || true
  else
    # GID 0 (root) — add nextjs to root group and make socket group-accessible
    addgroup nextjs root 2>/dev/null || true
    chmod 660 "$DOCKER_SOCK" 2>/dev/null || true
  fi
fi

# ── Database migrations ──
if [ "${PILOX_SKIP_MIGRATE:-}" = "1" ]; then
  echo "[entrypoint] PILOX_SKIP_MIGRATE=1 — skipping database migrations"
elif [ -z "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] WARNING: DATABASE_URL not set — skipping migrations"
else
  echo "[entrypoint] Running database migrations..."
  # Enum additions must run outside transactions (Postgres limitation).
  # Drizzle wraps migrations in transactions so ALTER TYPE ADD VALUE is silently skipped.
  # Run them here before Drizzle to guarantee they're applied.
  PGURI="$DATABASE_URL"
  psql "$PGURI" -c "ALTER TYPE model_instance_backend ADD VALUE IF NOT EXISTS 'aphrodite';" 2>/dev/null || true
  psql "$PGURI" -c "ALTER TABLE model_instances ALTER COLUMN instance_ip TYPE varchar(128);" 2>/dev/null || true
  node /app/migrate.cjs
fi

# ── Encrypt plaintext registry tokens (one-shot migration) ──
if [ -z "${DATABASE_URL:-}" ] || [ -z "${ENCRYPTION_KEY:-}" ]; then
  echo "[entrypoint] Skipping token encryption migration (missing DATABASE_URL or ENCRYPTION_KEY)"
else
  node /app/migrate-encrypt-tokens.cjs
fi

# ── Marketplace index ──
if [ "${PILOX_SKIP_MARKETPLACE_INDEX:-}" = "1" ]; then
  echo "[entrypoint] PILOX_SKIP_MARKETPLACE_INDEX=1 — skipping marketplace index rebuild"
elif [ -z "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] WARNING: DATABASE_URL not set — skipping marketplace index rebuild"
else
  echo "[entrypoint] Rebuilding marketplace catalog index (Postgres)..."
  node /app/marketplace-index.cjs || echo "[entrypoint] WARNING: marketplace index rebuild failed (non-fatal; list may use Redis/live fallback)"
fi

# Drop privileges to nextjs and exec the main process
exec su-exec nextjs "$@"
