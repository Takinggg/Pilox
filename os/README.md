# Hive OS — Operating System Layer

This directory contains the OS/appliance layer for Hive, turning it into a self-contained, installable system image (similar to Proxmox VE).

## Structure

- `Makefile` — Build orchestration (`make all`, `make build-iso`, `make clean`)
- `scripts/` — Build and lifecycle scripts
  - `build-iso.sh` — Creates the bootable ISO using Debian live-build
  - `build-app.sh` — Builds the Next.js application for production
  - `first-boot.sh` — First-boot initialization (secrets, DB, TLS, services)
  - `upgrade.sh` — In-place upgrade with automatic rollback
- `config/` — System configuration overlay
  - `package-lists/` — Debian packages included in the ISO
  - `includes.chroot/` — Files overlaid onto the root filesystem (systemd units, Hive config, MOTD)
- `installer/` — TUI-based installer (`python3-dialog`)

## Building

```bash
# Build everything (requires Debian with live-build installed)
make all

# Build just the ISO
make build-iso

# Set version
make all HIVE_VERSION=0.2.0
```

## Services

| Unit | Description |
|---|---|
| `hive-setup.service` | One-shot first-boot initialization |
| `hive-db.service` | PostgreSQL 16 via Docker |
| `hive-redis.service` | Redis 7 via Docker |
| `hive-app.service` | Next.js application server |
| `hive-proxy.service` | Caddy reverse proxy with TLS |

## Configuration (Hive OS)

- **Environment file**: `/etc/hive/hive.env` (generated from `/etc/hive/hive.env.template` on first boot).
- **Operator guide** (env vs dashboard runtime config): see `docs/OPERATOR_CONFIG.md` in the repo.
