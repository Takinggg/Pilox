#!/usr/bin/env bash
# Configure VFIO for GPU passthrough with Cloud Hypervisor.
#
# Usage: setup-vfio.sh [PCI_BDF]
#   PCI_BDF: PCI address of the GPU (e.g., 0000:41:00.0)
#            If omitted, lists available NVIDIA GPUs.
#
# Requirements:
#   - IOMMU enabled (intel_iommu=on or amd_iommu=on in kernel cmdline)
#   - vfio-pci kernel module
#   - Root privileges
set -euo pipefail

PCI_BDF="${1:-}"

# ── Check IOMMU ───────────────────────────────────────────

echo "=== VFIO GPU Passthrough Setup ==="

if [ ! -d /sys/kernel/iommu_groups ]; then
  echo "ERROR: IOMMU not available."
  echo "Add to kernel cmdline: intel_iommu=on iommu=pt (Intel) or amd_iommu=on iommu=pt (AMD)"
  exit 1
fi

IOMMU_GROUPS=$(find /sys/kernel/iommu_groups -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l)
if [ "${IOMMU_GROUPS}" -eq 0 ]; then
  echo "ERROR: No IOMMU groups found. IOMMU may not be enabled."
  exit 1
fi
echo "IOMMU enabled: ${IOMMU_GROUPS} groups found."

# ── Load vfio-pci module ──────────────────────────────────

if ! lsmod | grep -q vfio_pci; then
  echo "Loading vfio-pci module..."
  modprobe vfio-pci
fi

# ── List NVIDIA GPUs if no BDF provided ───────────────────

if [ -z "${PCI_BDF}" ]; then
  echo ""
  echo "Available NVIDIA GPUs:"
  lspci -nn | grep -i nvidia || echo "  (none found)"
  echo ""
  echo "Usage: $0 <PCI_BDF>"
  echo "Example: $0 0000:41:00.0"
  exit 0
fi

# ── Validate PCI BDF format ───────────────────────────────

if ! echo "${PCI_BDF}" | grep -qP '^[0-9a-fA-F]{4}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}\.[0-9a-fA-F]$'; then
  echo "ERROR: Invalid PCI BDF format: ${PCI_BDF}"
  echo "Expected format: 0000:XX:XX.X (e.g., 0000:41:00.0)"
  exit 1
fi

# ── Check device exists ───────────────────────────────────

DEVICE_PATH="/sys/bus/pci/devices/${PCI_BDF}"
if [ ! -d "${DEVICE_PATH}" ]; then
  echo "ERROR: PCI device ${PCI_BDF} not found"
  exit 1
fi

# ── Get IOMMU group ───────────────────────────────────────

IOMMU_GROUP=$(readlink -f "${DEVICE_PATH}/iommu_group" | xargs basename)
echo "Device ${PCI_BDF} is in IOMMU group ${IOMMU_GROUP}"

# Show all devices in the same group (all must be bound to vfio-pci)
echo "Devices in IOMMU group ${IOMMU_GROUP}:"
for dev in /sys/kernel/iommu_groups/"${IOMMU_GROUP}"/devices/*; do
  DEV_BDF=$(basename "${dev}")
  DEV_DESC=$(lspci -s "${DEV_BDF}" 2>/dev/null || echo "unknown")
  CURRENT_DRIVER=$(readlink -f "${dev}/driver" 2>/dev/null | xargs basename 2>/dev/null || echo "none")
  echo "  ${DEV_BDF}: ${DEV_DESC} [driver: ${CURRENT_DRIVER}]"
done

# ── Unbind from current driver ────────────────────────────

CURRENT_DRIVER=$(readlink -f "${DEVICE_PATH}/driver" 2>/dev/null | xargs basename 2>/dev/null || echo "none")

if [ "${CURRENT_DRIVER}" = "vfio-pci" ]; then
  echo "Device ${PCI_BDF} already bound to vfio-pci."
else
  if [ "${CURRENT_DRIVER}" != "none" ]; then
    echo "Unbinding ${PCI_BDF} from ${CURRENT_DRIVER}..."
    echo "${PCI_BDF}" > "/sys/bus/pci/drivers/${CURRENT_DRIVER}/unbind" 2>/dev/null || true
  fi

  # Get vendor:device ID for vfio-pci binding
  VENDOR_ID=$(cat "${DEVICE_PATH}/vendor" 2>/dev/null | sed 's/0x//')
  DEVICE_ID=$(cat "${DEVICE_PATH}/device" 2>/dev/null | sed 's/0x//')

  echo "Binding ${PCI_BDF} (${VENDOR_ID}:${DEVICE_ID}) to vfio-pci..."
  echo "${VENDOR_ID} ${DEVICE_ID}" > /sys/bus/pci/drivers/vfio-pci/new_id 2>/dev/null || true
  echo "${PCI_BDF}" > /sys/bus/pci/drivers/vfio-pci/bind 2>/dev/null || true
fi

# ── Verify binding ────────────────────────────────────────

FINAL_DRIVER=$(readlink -f "${DEVICE_PATH}/driver" 2>/dev/null | xargs basename 2>/dev/null || echo "none")
if [ "${FINAL_DRIVER}" = "vfio-pci" ]; then
  echo ""
  echo "=== GPU ${PCI_BDF} successfully bound to vfio-pci ==="
  echo ""
  echo "Set in Hive config:"
  echo "  CH_GPU_PCI_BDF=${PCI_BDF}"
else
  echo ""
  echo "WARNING: Device ${PCI_BDF} driver is '${FINAL_DRIVER}', expected 'vfio-pci'"
  echo "Check dmesg for errors."
  exit 1
fi
