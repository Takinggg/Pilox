#!/bin/sh
# Hive PostgreSQL Backup Script
# Scheduled backup with S3 upload support

set -e

BACKUP_DIR="/backups"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/hive_backup_${DATE}.sql.gz"
LOG_FILE="${BACKUP_DIR}/backup.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_FILE}"
}

log "Starting Hive backup..."

# Create backup
log "Creating PostgreSQL backup..."
pg_dump -h postgres_primary -U postgres -d hive | gzip > "${BACKUP_FILE}"

if [ ! -f "${BACKUP_FILE}" ]; then
    log "ERROR: Backup file not created"
    exit 1
fi

BACKUP_SIZE=$(stat -f%z "${BACKUP_FILE}" 2>/dev/null || stat -c%s "${BACKUP_FILE}" 2>/dev/null)
log "Backup created: ${BACKUP_FILE} (${BACKUP_SIZE} bytes)"

# Upload to S3 if configured
if [ -n "${AWS_S3_BUCKET}" ] && [ -n "${AWS_ACCESS_KEY_ID}" ] && [ -n "${AWS_SECRET_ACCESS_KEY}" ]; then
    log "Uploading to S3: s3://${AWS_S3_BUCKET}/hive/${DATE}/"

    # Configure AWS CLI if not present
    aws configure set aws_access_key_id "${AWS_ACCESS_KEY_ID}"
    aws configure set aws_secret_access_key "${AWS_SECRET_ACCESS_KEY}"
    aws configure set default.region "${AWS_REGION:-us-east-1}"

    # Upload backup
    aws s3 cp "${BACKUP_FILE}" "s3://${AWS_S3_BUCKET}/hive/${DATE}/hive_backup.sql.gz"

    # Upload WAL archive if exists
    if [ -d "/wal_archive" ]; then
        aws s3 sync "/wal_archive" "s3://${AWS_S3_BUCKET}/hive/${DATE}/wal_archive/"
    fi

    log "S3 upload completed"
fi

# Cleanup old local backups
log "Cleaning up backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "hive_backup_*.sql.gz" -mtime +${RETENTION_DAYS} -delete

# Count remaining backups
REMAINING=$(find "${BACKUP_DIR}" -name "hive_backup_*.sql.gz" | wc -l)
log "Local backups remaining: ${REMAINING}"

# Cleanup old S3 backups if applicable
if [ -n "${AWS_S3_BUCKET}" ] && [ -n "${AWS_ACCESS_KEY_ID}" ] && [ -n "${AWS_SECRET_ACCESS_KEY}" ]; then
    CUTOFF_DATE=$(date -d "${RETENTION_DAYS} days ago" +%Y-%m-%d)
    aws s3 ls "s3://${AWS_S3_BUCKET}/hive/" | while read -r prefix; do
        BACKUP_DATE=$(echo "${prefix}" | awk '{print $2}' | tr -d '/')
        if [ "${BACKUP_DATE}" < "${CUTOFF_DATE}" ]; then
            log "Deleting old S3 backup: ${BACKUP_DATE}"
            aws s3 rm "s3://${AWS_S3_BUCKET}/hive/${BACKUP_DATE}/" --recursive
        fi
    done
fi

log "Backup completed successfully!"

# Print summary
echo "=========================================="
echo "Hive Backup Summary"
echo "=========================================="
echo "Backup File: ${BACKUP_FILE}"
echo "Backup Size: ${BACKUP_SIZE} bytes"
echo "Retention: ${RETENTION_DAYS} days"
echo "S3 Bucket: ${AWS_S3_BUCKET:-not configured}"
echo "Local Backups: ${REMAINING}"
echo "=========================================="
