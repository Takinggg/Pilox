#!/usr/bin/env bash
# Setup Cloud Hypervisor for Hive agent isolation.
#
# Prerequisites:
#   - KVM support (/dev/kvm)
#   - hive-br0 bridge already created (setup-vmnet.sh)
#
# For GPU passthrough, also run setup-vfio.sh.
set -euo pipefail

CH_VERSION="${CH_VERSION:-v42.0}"
CH_BASE_DIR="${CH_BASE_DIR:-/var/lib/hive/cloud-hypervisor}"
CH_BIN="${CH_BIN:-/usr/local/bin/cloud-hypervisor}"

echo "=== Setting up Cloud Hypervisor ${CH_VERSION} for Hive ==="

# ── Install Cloud Hypervisor binary ────────────────────────

if [ -x "${CH_BIN}" ]; then
  echo "Cloud Hypervisor already installed at ${CH_BIN}"
  "${CH_BIN}" --version
else
  echo "Downloading Cloud Hypervisor ${CH_VERSION}..."
  ARCH=$(uname -m)
  case "${ARCH}" in
    x86_64)  BINARY="cloud-hypervisor-static" ;;
    aarch64) BINARY="cloud-hypervisor-static-aarch64" ;;
    *) echo "Unsupported architecture: ${ARCH}"; exit 1 ;;
  esac

  curl -fsSL -o /tmp/cloud-hypervisor \
    "https://github.com/cloud-hypervisor/cloud-hypervisor/releases/download/${CH_VERSION}/${BINARY}"
  chmod +x /tmp/cloud-hypervisor
  mv /tmp/cloud-hypervisor "${CH_BIN}"
  echo "Installed: $("${CH_BIN}" --version)"
fi

# ── Create directory structure ─────────────────────────────

echo "Creating directory structure at ${CH_BASE_DIR}..."
mkdir -p "${CH_BASE_DIR}"/{instances,images,kernels,firmware}
chmod 750 "${CH_BASE_DIR}"

# ── Copy kernel (shared with Firecracker if available) ─────

FC_KERNEL="/var/lib/hive/firecracker/kernels/vmlinux"
CH_KERNEL="${CH_BASE_DIR}/kernels/vmlinux"

if [ -f "${CH_KERNEL}" ]; then
  echo "Kernel already present at ${CH_KERNEL}"
elif [ -f "${FC_KERNEL}" ]; then
  echo "Linking kernel from Firecracker..."
  ln -f "${FC_KERNEL}" "${CH_KERNEL}" 2>/dev/null || cp "${FC_KERNEL}" "${CH_KERNEL}"
else
  echo "WARNING: No kernel found. Place a vmlinux at ${CH_KERNEL}"
  echo "         Cloud Hypervisor uses the same uncompressed Linux kernel as Firecracker."
fi

# ── Verify KVM access ─────────────────────────────────────

if [ ! -e /dev/kvm ]; then
  echo "ERROR: /dev/kvm not found. KVM support required."
  exit 1
fi

if [ ! -r /dev/kvm ] || [ ! -w /dev/kvm ]; then
  echo "WARNING: /dev/kvm not accessible. Check permissions (group=kvm, mode=0660)."
fi

echo ""
echo "=== Cloud Hypervisor setup complete ==="
echo "  Binary:     ${CH_BIN}"
echo "  Base dir:   ${CH_BASE_DIR}"
echo "  Kernel:     ${CH_KERNEL}"
echo ""
echo "For GPU passthrough, run: setup-vfio.sh <PCI_BDF>"
echo "For CoCo (TDX/SEV), install OVMF firmware and set CH_COCO_ENABLED=true"
