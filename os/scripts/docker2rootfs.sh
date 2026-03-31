#!/usr/bin/env bash
# docker2rootfs.sh — Convert a Docker image to a Firecracker rootfs
#
# Usage: docker2rootfs.sh <docker-image> <output-rootfs-path>
#
# Pipeline:
#   1. Check cache for previously converted image
#   2. docker pull → docker create → docker export
#   3. Copy base rootfs, overlay Docker filesystem on top
#   4. Cache the result for future use
#
# The Docker image's filesystem is overlaid on the Hive base rootfs,
# preserving systemd init, networking, and the hive-agent service.

set -euo pipefail

DOCKER_IMAGE="${1:?Usage: docker2rootfs.sh <docker-image> <output-rootfs-path>}"
OUTPUT_PATH="${2:?Usage: docker2rootfs.sh <docker-image> <output-rootfs-path>}"
BASE_ROOTFS="/var/lib/hive/firecracker/rootfs/base-rootfs.ext4"
CACHE_DIR="/var/lib/hive/firecracker/images"

# Sanitize image name for cache key
CACHE_KEY=$(echo "$DOCKER_IMAGE" | sed 's/[^a-zA-Z0-9._-]/_/g')
CACHED_PATH="${CACHE_DIR}/${CACHE_KEY}.ext4"

# Check cache
if [ -f "$CACHED_PATH" ]; then
    echo "Cache hit for $DOCKER_IMAGE, copying cached rootfs..."
    cp "$CACHED_PATH" "$OUTPUT_PATH"
    echo "Rootfs ready at $OUTPUT_PATH (from cache)."
    exit 0
fi

# Verify base rootfs exists
if [ ! -f "$BASE_ROOTFS" ]; then
    echo "Error: Base rootfs not found at $BASE_ROOTFS"
    echo "Run build-fc-rootfs.sh first."
    exit 1
fi

echo "Converting Docker image '$DOCKER_IMAGE' to Firecracker rootfs..."
mkdir -p "$CACHE_DIR"

# Pull the Docker image
echo "Pulling Docker image..."
docker pull "$DOCKER_IMAGE"

# Create a container (don't start it) and export its filesystem
echo "Exporting Docker filesystem..."
CONTAINER_ID=$(docker create "$DOCKER_IMAGE")
EXPORT_DIR=$(mktemp -d /tmp/hive-docker-export-XXXXXX)

cleanup() {
    docker rm "$CONTAINER_ID" 2>/dev/null || true
    rm -rf "$EXPORT_DIR" 2>/dev/null || true
    # Unmount if still mounted
    if mountpoint -q "${MOUNT_DIR:-/nonexistent}" 2>/dev/null; then
        umount "$MOUNT_DIR" 2>/dev/null || true
    fi
    rmdir "$MOUNT_DIR" 2>/dev/null || true
}
trap cleanup EXIT

docker export "$CONTAINER_ID" | tar -xf - -C "$EXPORT_DIR" \
    --exclude='dev/*' --exclude='proc/*' --exclude='sys/*'

# Copy base rootfs as starting point
echo "Preparing rootfs..."
cp "$BASE_ROOTFS" "$OUTPUT_PATH"

# Mount and overlay Docker filesystem
MOUNT_DIR=$(mktemp -d /tmp/hive-rootfs-mount-XXXXXX)
mount -o loop "$OUTPUT_PATH" "$MOUNT_DIR"

# Overlay Docker image contents, preserving hive-specific files
# Back up Hive configs before overlay
HIVE_BACKUP_DIR=$(mktemp -d /tmp/hive-rootfs-backup-XXXXXX)
for hive_file in \
    etc/systemd/system/hive-agent.service \
    etc/systemd/system/hive-vsock-bridge.service \
    etc/systemd/system/hive-serial-log.service \
    etc/systemd/network/20-eth0.network \
    etc/ssh/sshd_config.d/99-hive-hardening.conf; do
    if [ -f "$MOUNT_DIR/$hive_file" ]; then
        mkdir -p "$(dirname "$HIVE_BACKUP_DIR/$hive_file")"
        cp -a "$MOUNT_DIR/$hive_file" "$HIVE_BACKUP_DIR/$hive_file"
    fi
done

# Copy Docker filesystem
cp -a "$EXPORT_DIR/." "$MOUNT_DIR/" 2>/dev/null || true

# Restore Hive-specific files
cp -a "$HIVE_BACKUP_DIR/." "$MOUNT_DIR/" 2>/dev/null || true
rm -rf "$HIVE_BACKUP_DIR"

# Extract the Docker image's CMD/ENTRYPOINT and write it as the agent start script
ENTRYPOINT=$(docker inspect --format='{{join .Config.Entrypoint " "}}' "$DOCKER_IMAGE" 2>/dev/null || echo "")
CMD=$(docker inspect --format='{{join .Config.Cmd " "}}' "$DOCKER_IMAGE" 2>/dev/null || echo "")
WORKDIR=$(docker inspect --format='{{.Config.WorkingDir}}' "$DOCKER_IMAGE" 2>/dev/null || echo "/")

START_CMD="${ENTRYPOINT:+$ENTRYPOINT }${CMD}"
if [ -n "$START_CMD" ]; then
    cat > "$MOUNT_DIR/opt/agent/start.sh" << EOF
#!/bin/bash
cd "${WORKDIR:-/}"
exec $START_CMD
EOF
    chmod +x "$MOUNT_DIR/opt/agent/start.sh"
fi

# Extract Docker ENV vars and append to agent env
docker inspect --format='{{range .Config.Env}}{{println .}}{{end}}' "$DOCKER_IMAGE" 2>/dev/null \
    >> "$MOUNT_DIR/etc/hive-agent/env" || true

umount "$MOUNT_DIR"
rmdir "$MOUNT_DIR"
MOUNT_DIR=""

# Cache the result
cp "$OUTPUT_PATH" "$CACHED_PATH"

echo "Rootfs ready at $OUTPUT_PATH ($(du -h "$OUTPUT_PATH" | cut -f1))."
echo "Cached at $CACHED_PATH for future use."
