#!/usr/bin/env bash
# teardown-vmnet.sh — Remove the Firecracker VM bridge network
set -euo pipefail

BRIDGE="hive-br0"
VM_CIDR="10.0.96.0/19"

if ! ip link show "$BRIDGE" &>/dev/null; then
    echo "Bridge $BRIDGE does not exist, nothing to tear down."
    exit 0
fi

echo "Tearing down VM network bridge $BRIDGE..."

# Remove NAT rules (ignore errors if rules don't exist)
DEFAULT_IFACE=$(ip route | grep default | awk '{print $5}' | head -1)
if [ -n "$DEFAULT_IFACE" ]; then
    iptables -t nat -D POSTROUTING -s "$VM_CIDR" -o "$DEFAULT_IFACE" -j MASQUERADE 2>/dev/null || true
    iptables -D FORWARD -i "$BRIDGE" -o "$DEFAULT_IFACE" -j ACCEPT 2>/dev/null || true
    iptables -D FORWARD -i "$DEFAULT_IFACE" -o "$BRIDGE" -m state --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || true
fi

# Clean up any remaining per-VM tap devices
for tap in $(ip -o link show type tun 2>/dev/null | awk -F: '{print $2}' | tr -d ' ' | grep '^tap-'); do
    ip link del "$tap" 2>/dev/null || true
done

# Remove bridge
ip link set "$BRIDGE" down
ip link del "$BRIDGE"

echo "VM network bridge $BRIDGE removed."
