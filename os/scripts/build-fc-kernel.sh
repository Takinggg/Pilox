#!/usr/bin/env bash
# build-fc-kernel.sh — Download a Firecracker-compatible Linux kernel
#
# Downloads the pre-built kernel from Firecracker's quickstart assets.
# Pinned URL + SHA256 checksum to prevent supply chain attacks.
#
# Output: /var/lib/hive/firecracker/kernels/vmlinux

set -euo pipefail

KERNEL_DIR="/var/lib/hive/firecracker/kernels"
KERNEL_PATH="${KERNEL_DIR}/vmlinux"

# Pinned kernel — update both URL and hash together when upgrading
KERNEL_VERSION="5.10"
KERNEL_URL="https://s3.amazonaws.com/spec.ccfc.min/img/quickstart_guide/x86_64/kernels/vmlinux.bin"
KERNEL_SHA256="ea5e7d5cf494a8c4ba043259812fc018b44880d70bcbbfc4d57d2760631b1cd6"

if [ -f "$KERNEL_PATH" ]; then
    echo "Kernel already exists at $KERNEL_PATH, skipping."
    exit 0
fi

mkdir -p "$KERNEL_DIR"

# Check if pre-packaged kernel exists in ISO assets
if [ -f "/opt/hive/assets/vmlinux" ]; then
    echo "Verifying pre-packaged kernel checksum..."
    echo "${KERNEL_SHA256}  /opt/hive/assets/vmlinux" | sha256sum -c - || {
        echo "WARNING: Pre-packaged kernel checksum mismatch. Downloading fresh copy."
        rm -f /opt/hive/assets/vmlinux
    }
    if [ -f "/opt/hive/assets/vmlinux" ]; then
        cp /opt/hive/assets/vmlinux "$KERNEL_PATH"
        echo "Kernel installed from ISO assets (SHA256 verified)."
        exit 0
    fi
fi

echo "Downloading Firecracker-compatible kernel (${KERNEL_VERSION})..."
curl -fSL "$KERNEL_URL" -o "$KERNEL_PATH"

echo "${KERNEL_SHA256}  ${KERNEL_PATH}" | sha256sum -c - || {
    echo "FATAL: Kernel checksum mismatch! Possible supply chain attack."
    echo "Expected: ${KERNEL_SHA256}"
    echo "Got:      $(sha256sum "${KERNEL_PATH}" | cut -d' ' -f1)"
    rm -f "$KERNEL_PATH"
    exit 1
}

chmod 644 "$KERNEL_PATH"
echo "Kernel installed at $KERNEL_PATH ($(du -h "$KERNEL_PATH" | cut -f1), SHA256 verified)."
