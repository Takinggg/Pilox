#!/usr/bin/env bash
# first-boot.sh — Hive OS first-boot initialization
#
# This script runs once on first boot via hive-setup.service.
# It initializes the database, generates secrets, configures TLS,
# and starts all Hive services.

set -euo pipefail

HIVE_DIR="/opt/hive"
HIVE_CONF="/etc/hive/hive.conf"
HIVE_ENV="/etc/hive/hive.env"
HIVE_ENV_TEMPLATE="/etc/hive/hive.env.template"
LOG_FILE="/var/log/hive/first-boot.log"
MARKER_FILE="/etc/hive/.initialized"

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

# --- Skip if already initialized ---
if [ -f "$MARKER_FILE" ]; then
    log "Hive already initialized. Skipping first-boot setup."
    exit 0
fi

log "=== Hive OS First Boot Setup ==="
log "Starting initialization..."

# --- Generate hive.env from template ---
log "Generating environment configuration..."
if [ ! -f "$HIVE_ENV" ]; then
    if [ -f "$HIVE_ENV_TEMPLATE" ]; then
        cp "$HIVE_ENV_TEMPLATE" "$HIVE_ENV"
    else
        cat > "$HIVE_ENV" << 'ENV'
# Hive OS Environment Configuration
# Auto-generated on first boot

NODE_ENV=production
PORT=3000

# Database
DATABASE_URL=postgresql://hive:HIVE_DB_PASSWORD@localhost:5432/hive

# Redis
REDIS_PASSWORD=HIVE_REDIS_PASSWORD
REDIS_URL=redis://:HIVE_REDIS_PASSWORD@localhost:6379

# Marketplace: serve list from Postgres index (rebuilt after migrations / in app settings)
MARKETPLACE_CATALOG_SOURCE=db

# Auth
AUTH_SECRET=HIVE_AUTH_SECRET

# API Token (for CLI access)
HIVE_API_TOKEN=HIVE_API_TOKEN_VALUE
ENV
    fi
    chmod 600 "$HIVE_ENV"
fi

# --- Generate secrets ---
log "Generating authentication secrets..."

generate_secret() {
    openssl rand -base64 48 | tr -d '\n/+=' | head -c 64
}

AUTH_SECRET="$(generate_secret)"
DB_PASSWORD="$(generate_secret | head -c 32)"
API_TOKEN="$(generate_secret)"
INTERNAL_TOKEN="$(generate_secret)"
REDIS_PASSWORD="$(generate_secret | head -c 32)"
ENCRYPTION_KEY="$(openssl rand -hex 32)"

sed -i "s|HIVE_AUTH_SECRET|${AUTH_SECRET}|g" "$HIVE_ENV"
sed -i "s|HIVE_DB_PASSWORD|${DB_PASSWORD}|g" "$HIVE_ENV"
sed -i "s|HIVE_API_TOKEN_VALUE|${API_TOKEN}|g" "$HIVE_ENV"
sed -i "s|HIVE_INTERNAL_TOKEN_VALUE|${INTERNAL_TOKEN}|g" "$HIVE_ENV"
sed -i "s|HIVE_REDIS_PASSWORD|${REDIS_PASSWORD}|g" "$HIVE_ENV"
sed -i "s|HIVE_ENCRYPTION_KEY|${ENCRYPTION_KEY}|g" "$HIVE_ENV"

log "Secrets generated."

# --- Wait for Docker ---
log "Waiting for Docker daemon..."
RETRIES=30
while ! docker info > /dev/null 2>&1; do
    RETRIES=$((RETRIES - 1))
    if [ $RETRIES -le 0 ]; then
        error "Docker daemon did not start within 30 seconds."
    fi
    sleep 1
done
log "Docker is ready."

# --- Create Docker network ---
log "Creating Docker network..."
docker network create hive-network 2>/dev/null || true

# --- Load pre-packaged Docker images ---
IMAGE_DIR="${HIVE_DIR}/images"
if [ -d "$IMAGE_DIR" ] && [ "$(ls -A "$IMAGE_DIR" 2>/dev/null)" ]; then
    log "Loading pre-packaged Docker images..."
    for image_tar in "$IMAGE_DIR"/*.tar; do
        log "  Loading: $(basename "$image_tar")"
        docker load -i "$image_tar" || log "  Warning: Failed to load $(basename "$image_tar")"
    done
    log "Docker images loaded."
else
    log "No pre-packaged Docker images found. Will pull on demand."
fi

# --- Start PostgreSQL ---
log "Starting PostgreSQL..."
systemctl start hive-db.service

# Wait for PostgreSQL to be ready
RETRIES=30
while ! docker exec hive-postgres pg_isready -U hive > /dev/null 2>&1; do
    RETRIES=$((RETRIES - 1))
    if [ $RETRIES -le 0 ]; then
        error "PostgreSQL did not become ready within 30 seconds."
    fi
    sleep 1
done
log "PostgreSQL is ready."

# --- Set database password ---
log "Configuring database user..."
docker exec hive-postgres psql -U hive -c "ALTER USER hive WITH PASSWORD '${DB_PASSWORD}';" > /dev/null 2>&1 || true

# --- Start Redis ---
log "Starting Redis..."
systemctl start hive-redis.service

RETRIES=15
while ! docker exec hive-redis redis-cli -a "${REDIS_PASSWORD}" ping > /dev/null 2>&1; do
    RETRIES=$((RETRIES - 1))
    if [ $RETRIES -le 0 ]; then
        error "Redis did not become ready within 15 seconds."
    fi
    sleep 1
done
log "Redis is ready."

# --- Run database migrations ---
log "Running database migrations..."
cd "${HIVE_DIR}/app"

# Source environment
set -a
source "$HIVE_ENV"
set +a

if [ -d "drizzle" ]; then
    npm run db:migrate:run 2>&1 | tee -a "$LOG_FILE" || {
        error "Database migration failed. Check $LOG_FILE and DATABASE_URL."
    }
else
    error "No drizzle/ migration directory in ${HIVE_DIR}/app — package is incomplete."
fi

log "Database migrations complete."

log "Rebuilding marketplace catalog index (Postgres)..."
if npm run marketplace:index-sync 2>&1 | tee -a "$LOG_FILE"; then
    log "Marketplace index sync complete."
else
    log "WARNING: marketplace:index-sync failed — OK if no registries yet; UI may use Redis/live fallback until index succeeds."
fi

if ! grep -qE '^MARKETPLACE_CATALOG_SOURCE=' "$HIVE_ENV" 2>/dev/null; then
    echo 'MARKETPLACE_CATALOG_SOURCE=db' >> "$HIVE_ENV"
    log "Appended MARKETPLACE_CATALOG_SOURCE=db to hive.env"
fi

# --- Setup Firecracker microVM infrastructure ---
log "Setting up Firecracker microVM infrastructure..."

# Verify KVM
if [ ! -e /dev/kvm ]; then
    log "WARNING: /dev/kvm not available. Firecracker requires hardware virtualization (VT-x/AMD-V)."
    log "Agent microVMs will NOT start without KVM support."
else
    # Restrict to kvm group only — no world access
    chown root:kvm /dev/kvm
    chmod 660 /dev/kvm
    log "KVM is available (permissions: root:kvm 0660)."
fi

# Add hive user to kvm group
usermod -aG kvm hive 2>/dev/null || true

# Create jailer system user (unprivileged, UID/GID 1500)
if ! id -u fc-jailer &>/dev/null; then
    groupadd -g 1500 fc-jailer 2>/dev/null || true
    useradd -r -u 1500 -g 1500 -s /usr/sbin/nologin -d /nonexistent fc-jailer 2>/dev/null || true
    log "Created fc-jailer system user (uid=1500, gid=1500)."
fi

# Create inference service user (unprivileged, GPU access via video/render groups)
if ! id -u hive-inference &>/dev/null; then
    useradd -r -s /usr/sbin/nologin -d /nonexistent hive-inference 2>/dev/null || true
    usermod -aG video,render hive-inference 2>/dev/null || true
    log "Created hive-inference system user."
fi

# Create Firecracker directory structure
mkdir -p /var/lib/hive/firecracker/{kernels,rootfs,instances,images}
chown -R hive:hive /var/lib/hive/firecracker

# Create model storage directory
mkdir -p /var/lib/hive/models
chown hive-inference:hive-inference /var/lib/hive/models

# Create jailer chroot base directory
mkdir -p /srv/jailer
chown root:root /srv/jailer
chmod 755 /srv/jailer

# Install kernel
if [ ! -f "/var/lib/hive/firecracker/kernels/vmlinux" ]; then
    log "Installing Firecracker kernel..."
    bash /opt/hive/scripts/build-fc-kernel.sh 2>&1 | tee -a "$LOG_FILE"
fi

# Build or install base rootfs
if [ ! -f "/var/lib/hive/firecracker/rootfs/base-rootfs.ext4" ]; then
    log "Building base rootfs for agent VMs..."
    bash /opt/hive/scripts/build-fc-rootfs.sh 2>&1 | tee -a "$LOG_FILE"
fi

# Start VM networking bridge
log "Starting VM network bridge..."
systemctl start hive-vmnet.service
systemctl enable hive-vmnet.service
log "Firecracker setup complete."

# --- GPU detection + inference service setup ---
# Architecture: agents run in Firecracker VMs, NEVER get direct GPU access.
# GPU inference is provided by a shared host service (Ollama/vLLM).
# Agents access it via vsock (host ↔ VM, ~2μs latency).
log "Detecting GPU hardware..."
GPU_DETECTED=false

if lspci 2>/dev/null | grep -qi nvidia; then
    log "NVIDIA GPU detected via lspci."
    GPU_DETECTED=true
elif [ -e /dev/nvidia0 ]; then
    log "NVIDIA GPU detected via /dev/nvidia0."
    GPU_DETECTED=true
fi

if [ "$GPU_DETECTED" = "true" ]; then
    log "Setting up GPU inference service on the host..."

    # Install NVIDIA drivers if not already present
    if ! command -v nvidia-smi &>/dev/null; then
        log "Installing NVIDIA drivers..."
        if ! grep -q "non-free" /etc/apt/sources.list 2>/dev/null; then
            sed -i 's/bookworm main/bookworm main contrib non-free non-free-firmware/' /etc/apt/sources.list
        fi
        apt-get update -qq 2>&1 | tee -a "$LOG_FILE"
        apt-get install -y --no-install-recommends nvidia-driver nvidia-smi 2>&1 | tee -a "$LOG_FILE" || {
            log "WARNING: Failed to install NVIDIA drivers. GPU inference will not work."
            log "Install drivers manually: apt install nvidia-driver"
        }
    fi

    # Install Ollama (shared inference service) — pinned version + SHA256
    OLLAMA_VERSION="0.18.2"
    OLLAMA_SHA256="3a72ab2113b52f58ec76d02a4e30e07d80b4897a639e7cece9399b45fe72bfc0"
    if ! command -v ollama &>/dev/null; then
        log "Installing Ollama v${OLLAMA_VERSION}..."
        curl -fSL "https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}/ollama-linux-amd64.tar.zst" \
            -o /tmp/ollama.tar.zst
        echo "${OLLAMA_SHA256}  /tmp/ollama.tar.zst" | sha256sum -c - || {
            log "FATAL: Ollama checksum mismatch! Possible supply chain attack."
            log "Expected: ${OLLAMA_SHA256}"
            log "Got:      $(sha256sum /tmp/ollama.tar.zst | cut -d' ' -f1)"
            rm -f /tmp/ollama.tar.zst
            error "Ollama checksum verification failed."
        }
        tar --zstd -xf /tmp/ollama.tar.zst -C /usr/local 2>&1 | tee -a "$LOG_FILE"
        rm -f /tmp/ollama.tar.zst
        log "Ollama v${OLLAMA_VERSION} installed (SHA256 verified)."
    fi

    # Verify GPU and enable inference service
    if command -v nvidia-smi &>/dev/null; then
        log "GPU verification:"
        nvidia-smi --query-gpu=index,name,memory.total,driver_version --format=csv,noheader 2>&1 | tee -a "$LOG_FILE"
        sed -i 's/GPU_AVAILABLE=false/GPU_AVAILABLE=true/' "$HIVE_ENV"

        # Enable and start inference service + vsock proxy
        # Default: Ollama. Admin can switch to vLLM later via API.
        if command -v ollama &>/dev/null; then
            systemctl enable hive-inference.service 2>/dev/null || true
            systemctl start hive-inference.service 2>/dev/null || true
            systemctl enable hive-vsock-proxy.service 2>/dev/null || true
            systemctl start hive-vsock-proxy.service 2>/dev/null || true
            log "Ollama inference + vsock proxy started. Agents access GPU via vsock CID 2:11434."
        fi

        # Pre-configure vLLM service (disabled by default, admin switches via POST /api/system/inference)
        # vLLM is installed on-demand when the admin switches to it.

        log "GPU inference enabled. One process serves all agents."
        log "Switch to vLLM via: POST /api/system/inference {\"backend\":\"vllm\"}"
    else
        log "WARNING: nvidia-smi not available after driver install. GPU inference will not work."
    fi
else
    log "No NVIDIA GPU detected. GPU inference will not be available."
    log "(This is normal for CPU-only servers. Agents still run in Firecracker VMs.)"
fi

# --- Generate self-signed TLS certificate ---
log "Generating TLS certificate..."
TLS_DIR="/etc/hive/tls"
mkdir -p "$TLS_DIR"

if [ ! -f "${TLS_DIR}/server.crt" ]; then
    HOSTNAME=$(hostname)
    IP_ADDR=$(hostname -I | awk '{print $1}')

    # Default AUTH_URL for fresh installs (safe to override later in /etc/hive/hive.env).
    if grep -q '^AUTH_URL=https://HIVE_AUTH_HOST' "$HIVE_ENV" 2>/dev/null; then
        sed -i "s|^AUTH_URL=https://HIVE_AUTH_HOST$|AUTH_URL=https://${IP_ADDR}|g" "$HIVE_ENV"
        log "Set AUTH_URL default to https://${IP_ADDR}"
    fi

    openssl req -x509 -nodes -days 3650 \
        -newkey rsa:2048 \
        -keyout "${TLS_DIR}/server.key" \
        -out "${TLS_DIR}/server.crt" \
        -subj "/CN=${HOSTNAME}/O=Hive OS" \
        -addext "subjectAltName=DNS:${HOSTNAME},DNS:${HOSTNAME}.local,IP:${IP_ADDR},IP:127.0.0.1" \
        2>&1 | tee -a "$LOG_FILE"

    chmod 600 "${TLS_DIR}/server.key"
    chmod 644 "${TLS_DIR}/server.crt"
    log "TLS certificate generated."
else
    log "TLS certificate already exists."
fi

# --- Start Hive application ---
log "Starting Hive application..."
systemctl start hive-app.service

# Wait for app to respond
RETRIES=30
while ! curl -sf http://localhost:3000/api/system/health > /dev/null 2>&1; do
    RETRIES=$((RETRIES - 1))
    if [ $RETRIES -le 0 ]; then
        log "Warning: Hive app did not respond within 30 seconds. It may still be starting."
        break
    fi
    sleep 1
done

# --- Start reverse proxy ---
log "Starting reverse proxy..."
systemctl start hive-proxy.service

# --- Mark as initialized ---
date -Iseconds > "$MARKER_FILE"
log "Initialization marker created."

# --- Display access information ---
IP_ADDR=$(hostname -I | awk '{print $1}')
log ""
log "================================================"
log "  Hive OS initialization complete!"
log ""
log "  Web UI:    https://${IP_ADDR}:443"
log "  API:       https://${IP_ADDR}:443/api"
log "  CLI:       hive status"
log ""
log "  API Token: ${API_TOKEN}"
log "  (stored in /etc/hive/hive.env)"
log "================================================"
