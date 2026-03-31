#!/usr/bin/env bash
# build-fc-rootfs.sh — Build a base Firecracker rootfs image for Hive agent VMs
#
# Creates a minimal Debian Bookworm ext4 image with:
#   - systemd init, networking (systemd-networkd)
#   - Python3, Node.js, curl, ca-certificates
#   - hive-agent.service (reads /etc/hive-agent/env, runs /opt/agent/start.sh)
#   - Serial console on ttyS0 for log capture
#
# Output: /var/lib/hive/firecracker/rootfs/base-rootfs.ext4

set -euo pipefail

ROOTFS_DIR="/var/lib/hive/firecracker/rootfs"
ROOTFS_PATH="${ROOTFS_DIR}/base-rootfs.ext4"
ROOTFS_SIZE_MB=2048
MOUNT_DIR=$(mktemp -d /tmp/hive-rootfs-XXXXXX)

if [ -f "$ROOTFS_PATH" ]; then
    echo "Base rootfs already exists at $ROOTFS_PATH, skipping."
    exit 0
fi

# Check if pre-packaged rootfs exists in ISO assets
if [ -f "/opt/hive/assets/base-rootfs.ext4" ]; then
    echo "Copying pre-packaged rootfs..."
    mkdir -p "$ROOTFS_DIR"
    cp /opt/hive/assets/base-rootfs.ext4 "$ROOTFS_PATH"
    echo "Base rootfs installed from ISO assets."
    exit 0
fi

echo "Building base rootfs (${ROOTFS_SIZE_MB}MB)..."
mkdir -p "$ROOTFS_DIR"

# Create empty ext4 image
dd if=/dev/zero of="$ROOTFS_PATH" bs=1M count="$ROOTFS_SIZE_MB" status=progress
mkfs.ext4 -F "$ROOTFS_PATH"

# Mount and bootstrap
mount -o loop "$ROOTFS_PATH" "$MOUNT_DIR"

cleanup() {
    umount "$MOUNT_DIR" 2>/dev/null || true
    rmdir "$MOUNT_DIR" 2>/dev/null || true
}
trap cleanup EXIT

echo "Running debootstrap..."
debootstrap --variant=minbase bookworm "$MOUNT_DIR" http://deb.debian.org/debian

echo "Installing packages inside rootfs..."
chroot "$MOUNT_DIR" /bin/bash -c '
    apt-get update -qq
    apt-get install -y --no-install-recommends \
        systemd systemd-sysv dbus \
        python3 python3-pip \
        curl wget ca-certificates gnupg \
        iproute2 iputils-ping dnsutils \
        procps less jq \
        socat \
        openssh-server

    # Install Node.js 20 LTS from NodeSource (Bookworm ships 18.x which is EOL)
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
        | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
        > /etc/apt/sources.list.d/nodesource.list
    apt-get update -qq
    apt-get install -y --no-install-recommends nodejs

    # Clean apt cache
    apt-get clean
    rm -rf /var/lib/apt/lists/*

    # --- Serial console (ttyS0) for log capture ---
    # No login shell — just journal output for the host to capture
    cat > /etc/systemd/system/hive-serial-log.service << EOF
[Unit]
Description=Hive Serial Console Logger
After=systemd-journald.service

[Service]
Type=simple
ExecStart=/bin/sh -c "exec journalctl -f --no-pager > /dev/ttyS0 2>&1"
StandardOutput=null
Restart=always
RestartSec=1

[Install]
WantedBy=multi-user.target
EOF
    systemctl enable hive-serial-log
    # Disable interactive getty on ttyS0 (no login prompt)
    systemctl mask serial-getty@ttyS0

    # --- Networking via systemd-networkd ---
    # Placeholders replaced per-VM by the host at instance creation:
    #   AGENT_IP_PLACEHOLDER  → actual VM IP (e.g. 10.0.102.5)
    #   AGENT_GW_PLACEHOLDER  → bridge gateway IP (e.g. 10.0.100.1)
    #   AGENT_MASK_PLACEHOLDER → CIDR prefix length (e.g. 19)
    cat > /etc/systemd/network/20-eth0.network << EOF
[Match]
Name=eth0

[Network]
DHCP=no
Address=AGENT_IP_PLACEHOLDER/AGENT_MASK_PLACEHOLDER
Gateway=AGENT_GW_PLACEHOLDER
DNS=AGENT_GW_PLACEHOLDER 8.8.8.8
EOF
    systemctl enable systemd-networkd
    systemctl enable systemd-resolved

    # --- Create unprivileged agent user ---
    useradd -r -s /usr/sbin/nologin -d /opt/agent -m agent

    # --- Hive agent runner service ---
    mkdir -p /etc/hive-agent /opt/agent
    chown agent:agent /opt/agent
    cat > /etc/systemd/system/hive-agent.service << EOF
[Unit]
Description=Hive Agent Process
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=agent
Group=agent
EnvironmentFile=/etc/hive-agent/env
WorkingDirectory=/opt/agent
ExecStart=/opt/agent/start.sh
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/agent /tmp

[Install]
WantedBy=multi-user.target
EOF
    systemctl enable hive-agent

    # --- vsock bridge: localhost:11434 → host CID 2:11434 ---
    # This allows agents to use standard HTTP (e.g. curl http://localhost:11434)
    # to reach the shared GPU inference service (Ollama/vLLM) on the host.
    # CID 2 = host in the vsock address family.
    cat > /etc/systemd/system/hive-vsock-bridge.service << EOF
[Unit]
Description=Hive vsock bridge (inference API → host)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
# socat bridges TCP localhost:11434 ↔ vsock host(CID 2):11434
ExecStart=/usr/bin/socat TCP-LISTEN:11434,fork,reuseaddr VSOCK-CONNECT:2:11434
Restart=always
RestartSec=2
User=agent
Group=agent

[Install]
WantedBy=multi-user.target
EOF
    systemctl enable hive-vsock-bridge

    # Default start script (can be overridden per agent)
    cat > /opt/agent/start.sh << EOF
#!/bin/bash
echo "Hive agent started. No entrypoint configured."
exec sleep infinity
EOF
    chmod +x /opt/agent/start.sh

    # Default env file
    touch /etc/hive-agent/env

    # Set hostname
    echo "hive-agent" > /etc/hostname

    # Lock root account — no password login, SSH key only if needed
    passwd -l root

    # Disable unnecessary services
    systemctl mask systemd-timesyncd

    # Harden SSH: disable password auth, root login
    mkdir -p /etc/ssh/sshd_config.d
    cat > /etc/ssh/sshd_config.d/99-hive-hardening.conf << EOF
PermitRootLogin no
PasswordAuthentication no
PermitEmptyPasswords no
ChallengeResponseAuthentication no
UsePAM no
EOF

    # Remove unnecessary setuid/setgid binaries
    find / -xdev -perm /6000 -type f -exec chmod a-s {} + 2>/dev/null || true
'

echo "Base rootfs built at $ROOTFS_PATH ($(du -h "$ROOTFS_PATH" | cut -f1))."
