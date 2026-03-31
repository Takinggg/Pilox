#!/usr/bin/env bash
# upgrade.sh — In-place upgrade for Hive OS
#
# Usage: bash upgrade.sh [version]
#        bash upgrade.sh 0.2.0
#        bash upgrade.sh            # upgrades to latest

set -euo pipefail

HIVE_DIR="/opt/hive"
HIVE_ENV="/etc/hive/hive.env"
HIVE_CONF="/etc/hive/hive.conf"
UPDATE_URL="${HIVE_UPDATE_URL:-https://releases.hive-os.dev}"
LOG_FILE="/var/log/hive/upgrade.log"
BACKUP_DIR="/var/backups/hive/pre-upgrade"

TARGET_VERSION="${1:-}"
CURRENT_VERSION="$(cat "${HIVE_DIR}/app/VERSION" 2>/dev/null || echo 'unknown')"

# --- Logging ---
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg" | tee -a "$LOG_FILE"
}

error() {
    log "ERROR: $1"
    exit 1
}

cleanup() {
    if [ "${UPGRADE_STARTED:-false}" = "true" ] && [ "${UPGRADE_COMPLETE:-false}" != "true" ]; then
        log "Upgrade interrupted. Attempting rollback..."
        rollback
    fi
}

trap cleanup EXIT

# --- Rollback ---
rollback() {
    log "Rolling back to previous version..."

    if [ -d "${BACKUP_DIR}/app" ]; then
        rm -rf "${HIVE_DIR}/app"
        cp -a "${BACKUP_DIR}/app" "${HIVE_DIR}/app"
        log "Application files restored."
    fi

    log "Restarting services..."
    systemctl restart hive-app.service || true
    systemctl restart hive-proxy.service || true

    log "Rollback complete. Running version: ${CURRENT_VERSION}"
}

# --- Determine target version ---
if [ -z "$TARGET_VERSION" ]; then
    log "Checking for latest version..."
    TARGET_VERSION=$(curl -sf "${UPDATE_URL}/latest.txt" || echo "")
    if [ -z "$TARGET_VERSION" ]; then
        error "Could not determine latest version. Check your internet connection."
    fi
fi

log "=== Hive OS Upgrade ==="
log "Current version: ${CURRENT_VERSION}"
log "Target version:  ${TARGET_VERSION}"

if [ "$CURRENT_VERSION" = "$TARGET_VERSION" ]; then
    log "Already running version ${TARGET_VERSION}. Nothing to do."
    exit 0
fi

# --- Pre-flight checks ---
log "Running pre-flight checks..."

# Check disk space (need at least 1GB free)
AVAILABLE_KB=$(df -k "${HIVE_DIR}" | tail -1 | awk '{print $4}')
REQUIRED_KB=1048576
if [ "$AVAILABLE_KB" -lt "$REQUIRED_KB" ]; then
    error "Insufficient disk space. Need at least 1GB free, have $(( AVAILABLE_KB / 1024 ))MB."
fi

# Check that services are running
if ! systemctl is-active --quiet hive-app.service; then
    log "Warning: hive-app service is not running."
fi

# --- Create pre-upgrade backup ---
log "Creating pre-upgrade backup..."
mkdir -p "$BACKUP_DIR"
rm -rf "${BACKUP_DIR:?}/"*

cp -a "${HIVE_DIR}/app" "${BACKUP_DIR}/app"
cp "$HIVE_CONF" "${BACKUP_DIR}/hive.conf.bak"
cp "$HIVE_ENV" "${BACKUP_DIR}/hive.env.bak"

# Database backup
log "Backing up database..."
docker exec hive-postgres pg_dump -U hive hive | gzip > "${BACKUP_DIR}/db-backup.sql.gz" || {
    log "Warning: Database backup failed. Continuing anyway."
}

log "Pre-upgrade backup complete."

# --- Download new version ---
log "Downloading Hive v${TARGET_VERSION}..."
DOWNLOAD_DIR=$(mktemp -d)
ARCHIVE_URL="${UPDATE_URL}/v${TARGET_VERSION}/hive-${TARGET_VERSION}.tar.gz"

curl -fSL --progress-bar "$ARCHIVE_URL" -o "${DOWNLOAD_DIR}/hive-update.tar.gz" || {
    rm -rf "$DOWNLOAD_DIR"
    error "Failed to download update from ${ARCHIVE_URL}"
}

# Verify checksum if available
CHECKSUM_URL="${UPDATE_URL}/v${TARGET_VERSION}/sha256sum.txt"
if curl -sf "$CHECKSUM_URL" -o "${DOWNLOAD_DIR}/sha256sum.txt" 2>/dev/null; then
    cd "$DOWNLOAD_DIR"
    if sha256sum -c sha256sum.txt > /dev/null 2>&1; then
        log "Checksum verified."
    else
        rm -rf "$DOWNLOAD_DIR"
        error "Checksum verification failed. Download may be corrupted."
    fi
fi

log "Download complete."

# --- Extract update ---
log "Extracting update..."
mkdir -p "${DOWNLOAD_DIR}/extract"
tar -xzf "${DOWNLOAD_DIR}/hive-update.tar.gz" -C "${DOWNLOAD_DIR}/extract" || {
    rm -rf "$DOWNLOAD_DIR"
    error "Failed to extract update archive."
}

# --- Apply update ---
UPGRADE_STARTED="true"

log "Stopping Hive services..."
systemctl stop hive-proxy.service || true
systemctl stop hive-app.service || true

# Wait for app to fully stop
sleep 3

log "Replacing application files..."
rm -rf "${HIVE_DIR}/app"
cp -a "${DOWNLOAD_DIR}/extract/app" "${HIVE_DIR}/app"

# Update CLI if included
if [ -d "${DOWNLOAD_DIR}/extract/cli" ]; then
    log "Updating CLI..."
    rm -rf /usr/local/lib/hive-cli
    cp -a "${DOWNLOAD_DIR}/extract/cli" /usr/local/lib/hive-cli/
fi

# --- Run database migrations ---
log "Running database migrations..."
cd "${HIVE_DIR}/app"

set -a
source "$HIVE_ENV"
set +a

# Ensure newer required keys exist (older installations may miss them).
ensure_env_kv() {
    local key="$1"
    local value="$2"
    if ! grep -qE "^${key}=" "$HIVE_ENV" 2>/dev/null; then
        echo "${key}=${value}" >> "$HIVE_ENV"
        log "Appended ${key}=… to hive.env"
    fi
}

# AUTH_URL and ENCRYPTION_KEY are required by the app env schema.
if ! grep -qE '^AUTH_URL=' "$HIVE_ENV" 2>/dev/null; then
    IP_ADDR=$(hostname -I | awk '{print $1}')
    ensure_env_kv "AUTH_URL" "https://${IP_ADDR}"
fi
if ! grep -qE '^ENCRYPTION_KEY=' "$HIVE_ENV" 2>/dev/null; then
    ensure_env_kv "ENCRYPTION_KEY" "$(openssl rand -hex 32)"
fi

if [ -d "prisma" ]; then
    npx prisma migrate deploy 2>&1 | tee -a "$LOG_FILE" || {
        log "Migration failed. Rolling back..."
        rollback
        exit 1
    }
elif [ -d "drizzle" ]; then
    npm run db:migrate:run 2>&1 | tee -a "$LOG_FILE" || {
        log "Migration failed. Rolling back..."
        rollback
        exit 1
    }
fi

log "Migrations complete."

log "Rebuilding marketplace catalog index (Postgres)..."
if npm run marketplace:index-sync 2>&1 | tee -a "$LOG_FILE"; then
    log "Marketplace index sync complete."
else
    log "WARNING: marketplace:index-sync failed — non-fatal; check registries and logs."
fi

if ! grep -qE '^MARKETPLACE_CATALOG_SOURCE=' "$HIVE_ENV" 2>/dev/null; then
    echo 'MARKETPLACE_CATALOG_SOURCE=db' >> "$HIVE_ENV"
    log "Appended MARKETPLACE_CATALOG_SOURCE=db to hive.env"
fi

# --- Restart services ---
log "Starting updated services..."
systemctl start hive-app.service

# Wait for app to respond
RETRIES=30
while ! curl -sf http://localhost:3000/api/health > /dev/null 2>&1; do
    RETRIES=$((RETRIES - 1))
    if [ $RETRIES -le 0 ]; then
        log "App did not respond after upgrade. Rolling back..."
        rollback
        exit 1
    fi
    sleep 1
done

systemctl start hive-proxy.service

UPGRADE_COMPLETE="true"

# --- Cleanup ---
rm -rf "$DOWNLOAD_DIR"

log ""
log "================================================"
log "  Upgrade complete!"
log "  ${CURRENT_VERSION} -> ${TARGET_VERSION}"
log ""
log "  Run 'hive status' to verify."
log "================================================"
