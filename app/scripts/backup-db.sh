#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Hive — Automated PostgreSQL backup script
# Usage: ./scripts/backup-db.sh
# Cron:  0 2 * * * /opt/hive/scripts/backup-db.sh >> /var/log/hive-backup.log 2>&1
# ─────────────────────────────────────────────────────────────
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/hive}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/hive_${TIMESTAMP}.sql.gz"

# Parse DATABASE_URL or use defaults
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-hive}"
DB_USER="${DB_USER:-hive}"

# Extract from DATABASE_URL if set
if [ -n "${DATABASE_URL:-}" ]; then
  # postgres://user:pass@host:port/dbname
  DB_USER=$(echo "$DATABASE_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')
  DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
  DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
  DB_NAME=$(echo "$DATABASE_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')
fi

echo "[$(date -Iseconds)] Starting backup of ${DB_NAME}..."

# Ensure backup dir exists
mkdir -p "${BACKUP_DIR}"

# Dump and compress
pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --no-owner \
  --no-privileges \
  --format=plain \
  | gzip > "${BACKUP_FILE}"

SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
echo "[$(date -Iseconds)] Backup complete: ${BACKUP_FILE} (${SIZE})"

# Clean up old backups
DELETED=$(find "${BACKUP_DIR}" -name "hive_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete -print | wc -l)
if [ "${DELETED}" -gt 0 ]; then
  echo "[$(date -Iseconds)] Cleaned ${DELETED} backups older than ${RETENTION_DAYS} days"
fi

echo "[$(date -Iseconds)] Done"
