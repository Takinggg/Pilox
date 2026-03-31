#!/usr/bin/env bash
# build-iso.sh — Build Hive OS installable ISO using Debian live-build
#
# Prerequisites:
#   apt-get install live-build debootstrap
#
# Environment:
#   HIVE_VERSION  — Version string (default: 0.1.0)
#   ARCH          — Target architecture (default: amd64)

set -euo pipefail

HIVE_VERSION="${HIVE_VERSION:-0.1.0}"
ARCH="${ARCH:-amd64}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OS_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="${OS_DIR}/build/iso-work"
OUTPUT_DIR="${OS_DIR}/build"

echo "Building Hive OS v${HIVE_VERSION} ISO (${ARCH})"
echo "Working directory: ${BUILD_DIR}"

# Clean previous build
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"
cd "${BUILD_DIR}"

# --- Configure live-build ---
lb config \
    --distribution bookworm \
    --architecture "${ARCH}" \
    --binary-images iso-hybrid \
    --debian-installer live \
    --debian-installer-gui false \
    --iso-application "Hive OS" \
    --iso-volume "HIVE-OS-${HIVE_VERSION}" \
    --iso-publisher "Hive Project" \
    --memtest none \
    --win32-loader false \
    --bootappend-live "boot=live components hostname=hive username=root" \
    --apt-recommends false \
    --security true \
    --updates true

# --- Package lists ---
mkdir -p config/package-lists
cp "${OS_DIR}/config/package-lists/hive.list.chroot" config/package-lists/

# --- Overlay filesystem ---
# Copy the chroot includes (systemd services, configs, etc.)
if [ -d "${OS_DIR}/config/includes.chroot" ]; then
    mkdir -p config/includes.chroot
    cp -a "${OS_DIR}/config/includes.chroot/." config/includes.chroot/
fi

# --- Copy Hive application ---
APP_BUILD="${OS_DIR}/build/app"
if [ -d "${APP_BUILD}" ]; then
    mkdir -p config/includes.chroot/opt/hive/app
    cp -a "${APP_BUILD}/." config/includes.chroot/opt/hive/app/
else
    echo "Warning: App build not found at ${APP_BUILD}. Run 'make build-app' first."
fi

# --- Copy Hive CLI ---
CLI_BUILD="${OS_DIR}/build/cli"
if [ -d "${CLI_BUILD}" ]; then
    mkdir -p config/includes.chroot/usr/local/lib/hive-cli
    mkdir -p config/includes.chroot/usr/local/bin
    cp -a "${CLI_BUILD}/." config/includes.chroot/usr/local/lib/hive-cli/
    # Create symlink for the hive command
    ln -sf /usr/local/lib/hive-cli/hive.js config/includes.chroot/usr/local/bin/hive
else
    echo "Warning: CLI build not found at ${CLI_BUILD}. Run 'make build-cli' first."
fi

# --- Copy installer ---
if [ -f "${OS_DIR}/installer/hive-installer.py" ]; then
    mkdir -p config/includes.chroot/opt/hive/installer
    cp "${OS_DIR}/installer/hive-installer.py" config/includes.chroot/opt/hive/installer/
    chmod +x config/includes.chroot/opt/hive/installer/hive-installer.py
fi

# --- Download Firecracker binaries (pinned version + SHA256 verified) ---
FC_VERSION="1.12.0"
FC_ARCH="x86_64"
FC_SHA256="392b5f7e4bf12871d1e8377a60ed3b384a46bc2f7d3771caf202aa7a63e32676"
echo "Downloading Firecracker v${FC_VERSION}..."
mkdir -p config/includes.chroot/usr/local/bin
curl -fSL "https://github.com/firecracker-microvm/firecracker/releases/download/v${FC_VERSION}/firecracker-v${FC_VERSION}-${FC_ARCH}.tgz" \
    -o /tmp/firecracker.tgz
echo "${FC_SHA256}  /tmp/firecracker.tgz" | sha256sum -c - || {
    echo "FATAL: Firecracker checksum mismatch! Possible supply chain attack."
    echo "Expected: ${FC_SHA256}"
    echo "Got:      $(sha256sum /tmp/firecracker.tgz | cut -d' ' -f1)"
    rm -f /tmp/firecracker.tgz
    exit 1
}
tar -xzf /tmp/firecracker.tgz -C /tmp
cp "/tmp/release-v${FC_VERSION}-${FC_ARCH}/firecracker-v${FC_VERSION}-${FC_ARCH}" \
    config/includes.chroot/usr/local/bin/firecracker
cp "/tmp/release-v${FC_VERSION}-${FC_ARCH}/jailer-v${FC_VERSION}-${FC_ARCH}" \
    config/includes.chroot/usr/local/bin/jailer
chmod +x config/includes.chroot/usr/local/bin/firecracker
chmod +x config/includes.chroot/usr/local/bin/jailer
rm -rf /tmp/firecracker.tgz /tmp/release-v${FC_VERSION}-${FC_ARCH}
echo "Firecracker v${FC_VERSION} embedded (SHA256 verified)."

# --- Copy Firecracker scripts ---
for fc_script in setup-vmnet.sh teardown-vmnet.sh build-fc-kernel.sh build-fc-rootfs.sh docker2rootfs.sh hive-vsock-proxy.py; do
    if [ -f "${OS_DIR}/scripts/${fc_script}" ]; then
        cp "${OS_DIR}/scripts/${fc_script}" config/includes.chroot/opt/hive/scripts/
        chmod +x "config/includes.chroot/opt/hive/scripts/${fc_script}"
    fi
done

# --- Copy first-boot and upgrade scripts ---
mkdir -p config/includes.chroot/opt/hive/scripts
for script in first-boot.sh upgrade.sh; do
    if [ -f "${OS_DIR}/scripts/${script}" ]; then
        cp "${OS_DIR}/scripts/${script}" config/includes.chroot/opt/hive/scripts/
        chmod +x "config/includes.chroot/opt/hive/scripts/${script}"
    fi
done

# --- Hooks: Enable services on first boot ---
mkdir -p config/hooks/normal
cat > config/hooks/normal/0100-enable-services.hook.chroot << 'HOOK'
#!/bin/bash
systemctl enable hive-setup.service
systemctl enable hive-db.service
systemctl enable hive-redis.service
systemctl enable hive-app.service
systemctl enable hive-proxy.service
systemctl enable docker.service
systemctl enable ssh.service
systemctl enable hive-vmnet.service
HOOK
chmod +x config/hooks/normal/0100-enable-services.hook.chroot

# --- Docker images: pre-pull and save for offline use ---
cat > config/hooks/normal/0200-prepare-docker.hook.chroot << 'HOOK'
#!/bin/bash
# Pre-install Docker GPG key and repository
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" \
    > /etc/apt/sources.list.d/docker.list
HOOK
chmod +x config/hooks/normal/0200-prepare-docker.hook.chroot

# --- Build the ISO ---
echo ""
echo "Starting live-build..."
lb build 2>&1 | tee "${OUTPUT_DIR}/build.log"

# --- Move final ISO ---
ISO_FILE=$(find . -maxdepth 1 -name '*.iso' -type f | head -n 1)
if [ -n "${ISO_FILE}" ]; then
    FINAL_ISO="${OUTPUT_DIR}/hive-os-${HIVE_VERSION}-${ARCH}.iso"
    mv "${ISO_FILE}" "${FINAL_ISO}"
    ISO_SIZE=$(du -h "${FINAL_ISO}" | cut -f1)
    echo ""
    echo "Build complete!"
    echo "  ISO: ${FINAL_ISO}"
    echo "  Size: ${ISO_SIZE}"
    echo "  SHA256: $(sha256sum "${FINAL_ISO}" | cut -d' ' -f1)"
else
    echo "Error: ISO build failed. Check ${OUTPUT_DIR}/build.log"
    exit 1
fi
