#!/usr/bin/env bash
# setup-vmnet.sh — Create and configure the bridge network for Firecracker agent VMs
#
# Uses a /19 CIDR (10.0.96.0/19 = 10.0.96.0–10.0.127.255) to cover
# 16 agent subnets (10.0.100–115.0/24 = ~4048 VMs).
# Gateway for all VMs is 10.0.100.1.
set -euo pipefail

BRIDGE="hive-br0"
BRIDGE_IP="10.0.100.1/19"
VM_CIDR="10.0.96.0/19"

# Skip if bridge already exists
if ip link show "$BRIDGE" &>/dev/null; then
    echo "Bridge $BRIDGE already exists, skipping creation."
    exit 0
fi

echo "Creating VM network bridge $BRIDGE ($VM_CIDR)..."

# Create bridge
ip link add name "$BRIDGE" type bridge
ip addr add "$BRIDGE_IP" dev "$BRIDGE"
ip link set "$BRIDGE" up

# Enable IP forwarding (persistent via sysctl.d/99-hive-firecracker.conf)
sysctl -w net.ipv4.ip_forward=1 >/dev/null

# Get the default outbound interface
DEFAULT_IFACE=$(ip route | grep default | awk '{print $5}' | head -1)

if [ -z "$DEFAULT_IFACE" ]; then
    echo "Warning: No default route found. NAT rules not applied."
    exit 0
fi

# NAT for all VM traffic
iptables -t nat -A POSTROUTING -s "$VM_CIDR" -o "$DEFAULT_IFACE" -j MASQUERADE
iptables -A FORWARD -i "$BRIDGE" -o "$DEFAULT_IFACE" -j ACCEPT
iptables -A FORWARD -i "$DEFAULT_IFACE" -o "$BRIDGE" -m state --state RELATED,ESTABLISHED -j ACCEPT

echo "VM network bridge $BRIDGE ready (CIDR: $VM_CIDR, NAT via $DEFAULT_IFACE)."
