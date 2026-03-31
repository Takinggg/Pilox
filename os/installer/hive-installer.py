#!/usr/bin/env python3
"""
Hive OS Installer — TUI-based installer for Hive OS.

Provides a guided installation process with:
  - Welcome screen
  - Disk selection
  - Network configuration (DHCP or static)
  - Admin account creation
  - Installation with progress feedback
  - Completion summary with access URL

Requires: python3, python3-dialog, lsblk, parted, debootstrap
"""

import os
import sys
import subprocess
import json
import time
import hashlib
import secrets
import shutil
import signal
from pathlib import Path

try:
    import dialog
except ImportError:
    # Fallback: try locale-aware import
    try:
        from dialog import Dialog
    except ImportError:
        print("Error: python3-dialog is required. Install with: apt-get install python3-dialog")
        sys.exit(1)

VERSION = "0.1.0"
HIVE_SOURCE = "/opt/hive"
LOG_FILE = "/var/log/hive-install.log"
MIN_DISK_GB = 20


class HiveInstaller:
    """TUI installer for Hive OS."""

    def __init__(self):
        self.d = dialog.Dialog(dialog="dialog")
        self.d.set_background_title(f"Hive OS v{VERSION} Installer")
        self.config = {
            "disk": "",
            "hostname": "hive",
            "domain": "local",
            "network_mode": "dhcp",
            "ip_address": "",
            "netmask": "255.255.255.0",
            "gateway": "",
            "dns": "1.1.1.1",
            "admin_user": "admin",
            "admin_password": "",
        }
        self.log_fh = None

    def log(self, message: str) -> None:
        """Write a message to the install log."""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        line = f"[{timestamp}] {message}\n"
        if self.log_fh:
            self.log_fh.write(line)
            self.log_fh.flush()

    def run_cmd(self, cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
        """Execute a command and log its output."""
        self.log(f"CMD: {' '.join(cmd)}")
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,
        )
        if result.stdout:
            self.log(f"STDOUT: {result.stdout.strip()}")
        if result.stderr:
            self.log(f"STDERR: {result.stderr.strip()}")
        if check and result.returncode != 0:
            raise subprocess.CalledProcessError(result.returncode, cmd, result.stdout, result.stderr)
        return result

    def get_disks(self) -> list[dict]:
        """List available block devices suitable for installation."""
        try:
            result = self.run_cmd(
                ["lsblk", "-J", "-b", "-d", "-o", "NAME,SIZE,TYPE,MODEL,TRAN"],
                check=False,
            )
            data = json.loads(result.stdout)
        except (json.JSONDecodeError, subprocess.CalledProcessError):
            return []

        disks = []
        for dev in data.get("blockdevices", []):
            if dev.get("type") != "disk":
                continue
            name = dev.get("name", "")
            # Skip loop, ram, and optical devices
            if name.startswith(("loop", "ram", "sr", "fd")):
                continue
            size_bytes = int(dev.get("size", 0))
            size_gb = size_bytes / (1024 ** 3)
            if size_gb < MIN_DISK_GB:
                continue
            model = (dev.get("model") or "Unknown").strip()
            transport = (dev.get("tran") or "").strip()
            disks.append({
                "name": name,
                "path": f"/dev/{name}",
                "size_bytes": size_bytes,
                "size_gb": round(size_gb, 1),
                "model": model,
                "transport": transport,
            })

        return disks

    def check_kvm_support(self) -> None:
        """Check if CPU supports hardware virtualization for Firecracker."""
        try:
            result = subprocess.run(
                ["grep", "-Ec", "vmx|svm", "/proc/cpuinfo"],
                capture_output=True, text=True
            )
            if result.returncode != 0 or not result.stdout.strip() or result.stdout.strip() == "0":
                self.d.msgbox(
                    "WARNING: Hardware virtualization not detected.\n\n"
                    "Firecracker microVMs require VT-x (Intel) or AMD-V.\n"
                    "Agent isolation will NOT work without KVM support.\n\n"
                    "Please enable VT-x/AMD-V in your BIOS settings.\n"
                    "Installation will continue, but agents may not start.",
                    height=14,
                    width=64,
                    title="KVM Warning",
                )
                self.log("WARNING: KVM/VT-x/AMD-V not detected on this CPU.")
            else:
                self.log("KVM support detected.")
        except Exception:
            self.log("Could not check KVM support.")

    def check_gpu_support(self) -> None:
        """Detect NVIDIA GPU hardware and inform the user."""
        try:
            result = subprocess.run(
                ["lspci"], capture_output=True, text=True, timeout=10
            )
            nvidia_lines = [
                line for line in result.stdout.splitlines()
                if "nvidia" in line.lower()
            ]
            if nvidia_lines:
                gpu_names = "\n".join(f"  - {line.split(': ', 1)[-1]}" for line in nvidia_lines[:4])
                self.d.msgbox(
                    f"NVIDIA GPU detected:\n\n{gpu_names}\n\n"
                    "GPU inference will be configured at first boot.\n"
                    "A shared inference service (Ollama) runs on the host.\n"
                    "All agents access it via vsock (~2us latency).\n"
                    "One process serves N agents (efficient VRAM usage).\n\n"
                    "Installed at first boot:\n"
                    "  - NVIDIA drivers (from Debian non-free)\n"
                    "  - Ollama inference server",
                    height=18,
                    width=64,
                    title="GPU Detected",
                )
                self.config["gpu_detected"] = True
                self.log(f"NVIDIA GPU detected: {len(nvidia_lines)} device(s).")
            else:
                self.log("No NVIDIA GPU detected. GPU agents will not be available.")
                self.config["gpu_detected"] = False
        except Exception:
            self.log("Could not check GPU support.")
            self.config["gpu_detected"] = False

    def show_welcome(self) -> bool:
        """Display the welcome screen."""
        code = self.d.yesno(
            "Welcome to the Hive OS installer.\n\n"
            "Hive is a self-hosted AI agent management platform. "
            "This installer will guide you through setting up Hive OS "
            "on your server.\n\n"
            "Requirements:\n"
            f"  - At least {MIN_DISK_GB} GB disk space\n"
            "  - 4 GB RAM minimum (8 GB recommended)\n"
            "  - CPU with VT-x/AMD-V (for Firecracker microVMs)\n"
            "  - Network connectivity\n\n"
            "WARNING: The selected disk will be completely erased.\n\n"
            "Continue with installation?",
            height=20,
            width=64,
            title="Welcome",
        )
        return code == self.d.OK

    def select_disk(self) -> bool:
        """Present disk selection dialog."""
        disks = self.get_disks()

        if not disks:
            self.d.msgbox(
                f"No suitable disks found.\n\n"
                f"Ensure you have a disk with at least {MIN_DISK_GB} GB available.",
                height=10,
                width=50,
                title="Error",
            )
            return False

        choices = []
        for disk in disks:
            label = f"{disk['path']}"
            desc = f"{disk['size_gb']} GB - {disk['model']}"
            if disk["transport"]:
                desc += f" ({disk['transport']})"
            choices.append((label, desc))

        code, selection = self.d.menu(
            "Select the disk to install Hive OS on.\n\n"
            "WARNING: ALL data on the selected disk will be erased.",
            height=18,
            width=64,
            menu_height=len(choices),
            choices=choices,
            title="Disk Selection",
        )

        if code != self.d.OK:
            return False

        # Confirm destructive action
        disk_info = next(d for d in disks if d["path"] == selection)
        code = self.d.yesno(
            f"Are you sure you want to install on:\n\n"
            f"  Disk:   {disk_info['path']}\n"
            f"  Model:  {disk_info['model']}\n"
            f"  Size:   {disk_info['size_gb']} GB\n\n"
            f"ALL DATA ON THIS DISK WILL BE DESTROYED.\n\n"
            f"Proceed?",
            height=14,
            width=54,
            title="Confirm Disk",
        )

        if code != self.d.OK:
            return False

        self.config["disk"] = selection
        return True

    def configure_network(self) -> bool:
        """Configure network settings."""
        code, selection = self.d.menu(
            "Select network configuration mode:",
            height=12,
            width=50,
            menu_height=2,
            choices=[
                ("dhcp", "Automatic (DHCP)"),
                ("static", "Manual (Static IP)"),
            ],
            title="Network Configuration",
        )

        if code != self.d.OK:
            return False

        self.config["network_mode"] = selection

        if selection == "static":
            # IP Address
            code, ip = self.d.inputbox(
                "Enter the static IP address:",
                init=self.config["ip_address"] or "192.168.1.100",
                height=10,
                width=50,
                title="IP Address",
            )
            if code != self.d.OK:
                return False
            self.config["ip_address"] = ip

            # Netmask
            code, netmask = self.d.inputbox(
                "Enter the subnet mask:",
                init=self.config["netmask"],
                height=10,
                width=50,
                title="Subnet Mask",
            )
            if code != self.d.OK:
                return False
            self.config["netmask"] = netmask

            # Gateway
            code, gw = self.d.inputbox(
                "Enter the default gateway:",
                init=self.config["gateway"] or "192.168.1.1",
                height=10,
                width=50,
                title="Gateway",
            )
            if code != self.d.OK:
                return False
            self.config["gateway"] = gw

            # DNS
            code, dns = self.d.inputbox(
                "Enter DNS server(s) (comma-separated):",
                init=self.config["dns"],
                height=10,
                width=50,
                title="DNS Servers",
            )
            if code != self.d.OK:
                return False
            self.config["dns"] = dns

        # Hostname
        code, hostname = self.d.inputbox(
            "Enter the hostname for this server:",
            init=self.config["hostname"],
            height=10,
            width=50,
            title="Hostname",
        )
        if code != self.d.OK:
            return False
        self.config["hostname"] = hostname

        return True

    def create_admin_account(self) -> bool:
        """Create the admin user account."""
        code, username = self.d.inputbox(
            "Enter the admin username:",
            init=self.config["admin_user"],
            height=10,
            width=50,
            title="Admin Account",
        )
        if code != self.d.OK:
            return False
        self.config["admin_user"] = username

        while True:
            code, password = self.d.passwordbox(
                "Enter the admin password (min 8 characters):",
                height=10,
                width=50,
                title="Admin Password",
            )
            if code != self.d.OK:
                return False

            if len(password) < 8:
                self.d.msgbox(
                    "Password must be at least 8 characters.",
                    height=8,
                    width=40,
                    title="Invalid Password",
                )
                continue

            code, confirm = self.d.passwordbox(
                "Confirm the admin password:",
                height=10,
                width=50,
                title="Confirm Password",
            )
            if code != self.d.OK:
                return False

            if password != confirm:
                self.d.msgbox(
                    "Passwords do not match. Please try again.",
                    height=8,
                    width=40,
                    title="Mismatch",
                )
                continue

            self.config["admin_password"] = password
            break

        return True

    def show_summary(self) -> bool:
        """Display installation summary before proceeding."""
        net_info = "DHCP (automatic)"
        if self.config["network_mode"] == "static":
            net_info = (
                f"Static\n"
                f"  IP:      {self.config['ip_address']}\n"
                f"  Netmask: {self.config['netmask']}\n"
                f"  Gateway: {self.config['gateway']}\n"
                f"  DNS:     {self.config['dns']}"
            )

        gpu_info = "Detected (setup at first boot)" if self.config.get("gpu_detected") else "Not detected"

        code = self.d.yesno(
            f"Installation Summary\n"
            f"{'=' * 40}\n\n"
            f"Disk:     {self.config['disk']}\n"
            f"Hostname: {self.config['hostname']}\n"
            f"Admin:    {self.config['admin_user']}\n\n"
            f"Network:  {net_info}\n\n"
            f"Runtime:  Firecracker microVMs (agents)\n"
            f"GPU:      {gpu_info}\n\n"
            f"Begin installation?",
            height=22,
            width=54,
            title="Confirm Installation",
        )
        return code == self.d.OK

    def install(self) -> bool:
        """Execute the installation process with progress gauge."""
        steps = [
            ("Partitioning disk...", self._partition_disk),
            ("Formatting partitions...", self._format_partitions),
            ("Mounting filesystems...", self._mount_filesystems),
            ("Installing base system...", self._install_base_system),
            ("Configuring system...", self._configure_system),
            ("Installing Hive...", self._install_hive),
            ("Configuring network...", self._configure_network_files),
            ("Setting up admin account...", self._setup_admin),
            ("Installing bootloader...", self._install_bootloader),
            ("Finalizing...", self._finalize),
        ]

        total = len(steps)

        for i, (label, func) in enumerate(steps):
            percent = int((i / total) * 100)
            self.d.gauge_start(
                f"\n{label}",
                height=8,
                width=50,
                percent=percent,
                title="Installing Hive OS",
            )

            try:
                self.log(f"Step {i + 1}/{total}: {label}")
                func()
                self.log(f"Step {i + 1}/{total}: Complete")
            except Exception as e:
                self.d.gauge_stop()
                self.log(f"Step {i + 1}/{total}: FAILED - {e}")
                self.d.msgbox(
                    f"Installation failed at step:\n  {label}\n\n"
                    f"Error: {e}\n\n"
                    f"Check {LOG_FILE} for details.",
                    height=14,
                    width=54,
                    title="Installation Failed",
                )
                return False

            self.d.gauge_stop()

        return True

    def _partition_disk(self) -> None:
        """Create partitions: EFI (512M), boot (1G), root (remaining)."""
        disk = self.config["disk"]

        # Wipe existing partition table
        self.run_cmd(["wipefs", "-a", disk])

        # Create GPT partition table
        self.run_cmd(["parted", "-s", disk, "mklabel", "gpt"])

        # EFI System Partition
        self.run_cmd(["parted", "-s", disk, "mkpart", "EFI", "fat32", "1MiB", "513MiB"])
        self.run_cmd(["parted", "-s", disk, "set", "1", "esp", "on"])

        # Boot partition
        self.run_cmd(["parted", "-s", disk, "mkpart", "boot", "ext4", "513MiB", "1537MiB"])

        # Root partition (rest of disk)
        self.run_cmd(["parted", "-s", disk, "mkpart", "root", "ext4", "1537MiB", "100%"])

    def _format_partitions(self) -> None:
        """Format the created partitions."""
        disk = self.config["disk"]
        # Determine partition naming (nvme uses p1, sda uses 1)
        sep = "p" if "nvme" in disk or "mmcblk" in disk else ""

        self.run_cmd(["mkfs.fat", "-F32", f"{disk}{sep}1"])
        self.run_cmd(["mkfs.ext4", "-F", "-L", "hive-boot", f"{disk}{sep}2"])
        self.run_cmd(["mkfs.ext4", "-F", "-L", "hive-root", f"{disk}{sep}3"])

    def _mount_filesystems(self) -> None:
        """Mount partitions for installation."""
        disk = self.config["disk"]
        sep = "p" if "nvme" in disk or "mmcblk" in disk else ""
        target = "/mnt/hive"

        os.makedirs(target, exist_ok=True)
        self.run_cmd(["mount", f"{disk}{sep}3", target])

        os.makedirs(f"{target}/boot", exist_ok=True)
        self.run_cmd(["mount", f"{disk}{sep}2", f"{target}/boot"])

        os.makedirs(f"{target}/boot/efi", exist_ok=True)
        self.run_cmd(["mount", f"{disk}{sep}1", f"{target}/boot/efi"])

    def _install_base_system(self) -> None:
        """Install Debian base system via debootstrap."""
        target = "/mnt/hive"
        self.run_cmd([
            "debootstrap",
            "--arch=amd64",
            "--variant=minbase",
            "--include=systemd,systemd-sysv,dbus,locales",
            "bookworm",
            target,
            "http://deb.debian.org/debian",
        ])

    def _configure_system(self) -> None:
        """Configure the installed base system."""
        target = "/mnt/hive"
        hostname = self.config["hostname"]

        # Hostname
        Path(f"{target}/etc/hostname").write_text(f"{hostname}\n")

        # Hosts file
        Path(f"{target}/etc/hosts").write_text(
            f"127.0.0.1   localhost\n"
            f"127.0.1.1   {hostname}.{self.config['domain']} {hostname}\n\n"
            f"::1         localhost ip6-localhost ip6-loopback\n"
        )

        # Timezone
        self.run_cmd(["chroot", target, "ln", "-sf", "/usr/share/zoneinfo/UTC", "/etc/localtime"])

        # Locale
        Path(f"{target}/etc/locale.gen").write_text("en_US.UTF-8 UTF-8\n")
        self.run_cmd(["chroot", target, "locale-gen"])

        # fstab
        disk = self.config["disk"]
        sep = "p" if "nvme" in disk or "mmcblk" in disk else ""
        fstab = (
            f"# Hive OS filesystem table\n"
            f"{disk}{sep}3  /          ext4  errors=remount-ro  0  1\n"
            f"{disk}{sep}2  /boot      ext4  defaults           0  2\n"
            f"{disk}{sep}1  /boot/efi  vfat  umask=0077         0  1\n"
            f"tmpfs        /tmp       tmpfs defaults,noatime   0  0\n"
        )
        Path(f"{target}/etc/fstab").write_text(fstab)

        # Copy MOTD
        motd_src = f"{HIVE_SOURCE}/../os/config/includes.chroot/etc/motd"
        if os.path.exists(motd_src):
            shutil.copy2(motd_src, f"{target}/etc/motd")

    def _install_hive(self) -> None:
        """Copy Hive application and services into the target."""
        target = "/mnt/hive"

        # Copy Hive application
        hive_target = f"{target}/opt/hive"
        os.makedirs(hive_target, exist_ok=True)
        if os.path.exists(f"{HIVE_SOURCE}/app"):
            shutil.copytree(f"{HIVE_SOURCE}/app", f"{hive_target}/app", dirs_exist_ok=True)

        # Copy scripts
        os.makedirs(f"{hive_target}/scripts", exist_ok=True)
        scripts_src = f"{HIVE_SOURCE}/scripts"
        if os.path.isdir(scripts_src):
            for script in os.listdir(scripts_src):
                src = os.path.join(scripts_src, script)
                dst = os.path.join(f"{hive_target}/scripts", script)
                shutil.copy2(src, dst)
                os.chmod(dst, 0o755)

        # Copy systemd services
        systemd_src = f"{HIVE_SOURCE}/../os/config/includes.chroot/etc/systemd/system"
        systemd_dst = f"{target}/etc/systemd/system"
        os.makedirs(systemd_dst, exist_ok=True)
        if os.path.isdir(systemd_src):
            for svc in os.listdir(systemd_src):
                if svc.startswith("hive-"):
                    shutil.copy2(os.path.join(systemd_src, svc), os.path.join(systemd_dst, svc))

        # Copy Hive config
        config_dst = f"{target}/etc/hive"
        os.makedirs(config_dst, exist_ok=True)
        conf_src = f"{HIVE_SOURCE}/../os/config/includes.chroot/etc/hive"
        if os.path.isdir(conf_src):
            for f in os.listdir(conf_src):
                src = os.path.join(conf_src, f)
                if os.path.isfile(src):
                    shutil.copy2(src, os.path.join(config_dst, f))

        # Copy CLI
        cli_target = f"{target}/usr/local/lib/hive-cli"
        os.makedirs(cli_target, exist_ok=True)
        cli_src = f"{HIVE_SOURCE}/../cli/dist"
        if os.path.isdir(cli_src):
            shutil.copytree(cli_src, cli_target, dirs_exist_ok=True)
            # Create symlink
            bin_dir = f"{target}/usr/local/bin"
            os.makedirs(bin_dir, exist_ok=True)
            link_path = f"{bin_dir}/hive"
            if os.path.exists(link_path):
                os.remove(link_path)
            os.symlink("/usr/local/lib/hive-cli/hive.js", link_path)

        # Install packages in chroot
        pkg_list = f"{HIVE_SOURCE}/../os/config/package-lists/hive.list.chroot"
        if os.path.exists(pkg_list):
            packages = [
                line.strip()
                for line in Path(pkg_list).read_text().splitlines()
                if line.strip() and not line.strip().startswith("#")
            ]
            if packages:
                # Mount necessary filesystems for chroot
                for fs_mount in [("proc", "/proc"), ("sysfs", "/sys"), ("devtmpfs", "/dev")]:
                    mount_point = f"{target}{fs_mount[1]}"
                    os.makedirs(mount_point, exist_ok=True)
                    self.run_cmd(["mount", "--bind", fs_mount[1], mount_point], check=False)

                try:
                    self.run_cmd(["chroot", target, "apt-get", "update"], check=False)
                    self.run_cmd(
                        ["chroot", target, "apt-get", "install", "-y", "--no-install-recommends"]
                        + packages,
                        check=False,
                    )
                finally:
                    # Unmount
                    for fs_mount in ["/dev", "/sys", "/proc"]:
                        self.run_cmd(["umount", f"{target}{fs_mount}"], check=False)

    def _configure_network_files(self) -> None:
        """Write network configuration files."""
        target = "/mnt/hive"
        interfaces_dir = f"{target}/etc/network"
        os.makedirs(interfaces_dir, exist_ok=True)

        if self.config["network_mode"] == "dhcp":
            config_text = (
                "# Hive OS network configuration\n"
                "auto lo\n"
                "iface lo inet loopback\n\n"
                "auto eth0\n"
                "iface eth0 inet dhcp\n"
            )
        else:
            dns_servers = " ".join(s.strip() for s in self.config["dns"].split(","))
            config_text = (
                "# Hive OS network configuration\n"
                "auto lo\n"
                "iface lo inet loopback\n\n"
                "auto eth0\n"
                "iface eth0 inet static\n"
                f"    address {self.config['ip_address']}\n"
                f"    netmask {self.config['netmask']}\n"
                f"    gateway {self.config['gateway']}\n"
                f"    dns-nameservers {dns_servers}\n"
            )

        Path(f"{interfaces_dir}/interfaces").write_text(config_text)

        # resolv.conf for static
        if self.config["network_mode"] == "static":
            resolv = ""
            for server in self.config["dns"].split(","):
                server = server.strip()
                if server:
                    resolv += f"nameserver {server}\n"
            Path(f"{target}/etc/resolv.conf").write_text(resolv)

    def _setup_admin(self) -> None:
        """Create the admin system user."""
        target = "/mnt/hive"
        username = self.config["admin_user"]
        password = self.config["admin_password"]

        # Create the user
        self.run_cmd([
            "chroot", target,
            "useradd", "-m", "-s", "/bin/bash",
            "-G", "sudo,docker,kvm",
            username,
        ], check=False)

        # Set password
        proc = subprocess.run(
            ["chroot", target, "chpasswd"],
            input=f"{username}:{password}",
            capture_output=True,
            text=True,
        )
        self.log(f"chpasswd exit code: {proc.returncode}")

        # Create hive system user (for running the app service)
        self.run_cmd([
            "chroot", target,
            "useradd", "-r", "-s", "/usr/sbin/nologin",
            "-d", "/opt/hive",
            "hive",
        ], check=False)

        # Create fc-jailer system user (unprivileged UID 1500 for Firecracker jailer)
        self.run_cmd([
            "chroot", target,
            "groupadd", "-g", "1500", "fc-jailer",
        ], check=False)
        self.run_cmd([
            "chroot", target,
            "useradd", "-r", "-u", "1500", "-g", "1500",
            "-s", "/usr/sbin/nologin", "-d", "/nonexistent",
            "fc-jailer",
        ], check=False)

        # Create jailer chroot base directory
        os.makedirs(f"{target}/srv/jailer", exist_ok=True)

        # Set ownership
        self.run_cmd(["chroot", target, "chown", "-R", "hive:hive", "/opt/hive"], check=False)

        # Enable sudo without password for admin (initial setup convenience)
        sudoers_dir = f"{target}/etc/sudoers.d"
        os.makedirs(sudoers_dir, exist_ok=True)
        Path(f"{sudoers_dir}/hive-admin").write_text(
            f"{username} ALL=(ALL) ALL\n"
        )
        os.chmod(f"{sudoers_dir}/hive-admin", 0o440)

    def _install_bootloader(self) -> None:
        """Install GRUB bootloader."""
        target = "/mnt/hive"

        # Bind mount for chroot
        for mount in ["/dev", "/dev/pts", "/proc", "/sys", "/sys/firmware/efi/efivars"]:
            mount_point = f"{target}{mount}"
            os.makedirs(mount_point, exist_ok=True)
            self.run_cmd(["mount", "--bind", mount, mount_point], check=False)

        try:
            # Install GRUB packages
            self.run_cmd([
                "chroot", target,
                "apt-get", "install", "-y", "grub-efi-amd64", "linux-image-amd64",
            ], check=False)

            # Install GRUB to EFI
            self.run_cmd([
                "chroot", target,
                "grub-install", "--target=x86_64-efi",
                "--efi-directory=/boot/efi",
                "--bootloader-id=hive",
                "--recheck",
            ], check=False)

            # Update GRUB config
            self.run_cmd(["chroot", target, "update-grub"], check=False)
        finally:
            # Unmount in reverse order
            for mount in reversed(["/dev/pts", "/dev", "/proc", "/sys/firmware/efi/efivars", "/sys"]):
                self.run_cmd(["umount", f"{target}{mount}"], check=False)

    def _finalize(self) -> None:
        """Final installation steps."""
        target = "/mnt/hive"

        # Enable Hive services
        for svc in ["hive-setup", "hive-db", "hive-redis", "hive-vmnet", "hive-app", "hive-proxy"]:
            self.run_cmd([
                "chroot", target,
                "systemctl", "enable", f"{svc}.service",
            ], check=False)

        # Enable other services
        for svc in ["docker", "ssh"]:
            self.run_cmd([
                "chroot", target,
                "systemctl", "enable", f"{svc}.service",
            ], check=False)

        # Create log directory
        os.makedirs(f"{target}/var/log/hive", exist_ok=True)

        # Sync and unmount
        self.run_cmd(["sync"])

        for mount in ["/boot/efi", "/boot", "/"]:
            mount_point = target if mount == "/" else f"{target}{mount}"
            self.run_cmd(["umount", mount_point], check=False)

    def show_completion(self) -> None:
        """Display installation complete message."""
        if self.config["network_mode"] == "static":
            ip = self.config["ip_address"]
        else:
            ip = "<DHCP-assigned IP>"

        self.d.msgbox(
            "Hive OS installation complete!\n\n"
            "Remove the installation media and reboot.\n\n"
            f"After reboot, access Hive at:\n\n"
            f"  Web UI:  https://{ip}:443\n"
            f"  SSH:     ssh {self.config['admin_user']}@{ip}\n"
            f"  CLI:     hive status\n\n"
            "First boot will take a few minutes to initialize\n"
            "the database, generate certificates, and start\n"
            "all services.\n\n"
            "Thank you for choosing Hive OS!",
            height=20,
            width=56,
            title="Installation Complete",
        )

    def run(self) -> int:
        """Main installer flow."""
        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        self.log_fh = open(LOG_FILE, "a")

        try:
            self.log("=== Hive OS Installer Started ===")

            # Step 1: Welcome
            if not self.show_welcome():
                return 0

            # Step 1b: Check KVM support
            self.check_kvm_support()

            # Step 1c: Check GPU support
            self.check_gpu_support()

            # Step 2: Disk selection
            if not self.select_disk():
                return 0

            # Step 3: Network configuration
            if not self.configure_network():
                return 0

            # Step 4: Admin account
            if not self.create_admin_account():
                return 0

            # Step 5: Summary and confirmation
            if not self.show_summary():
                return 0

            # Step 6: Install
            if not self.install():
                return 1

            # Step 7: Completion
            self.show_completion()

            self.log("=== Installation Complete ===")
            return 0

        except KeyboardInterrupt:
            self.log("Installation cancelled by user.")
            self.d.msgbox(
                "Installation cancelled.",
                height=8,
                width=40,
                title="Cancelled",
            )
            return 1
        except Exception as e:
            self.log(f"Unhandled error: {e}")
            self.d.msgbox(
                f"An unexpected error occurred:\n\n{e}\n\n"
                f"Check {LOG_FILE} for details.",
                height=12,
                width=54,
                title="Error",
            )
            return 1
        finally:
            if self.log_fh:
                self.log_fh.close()


def main() -> int:
    """Entry point."""
    if os.geteuid() != 0:
        print("Error: The Hive OS installer must be run as root.")
        print("  Try: sudo python3 hive-installer.py")
        return 1

    installer = HiveInstaller()
    return installer.run()


if __name__ == "__main__":
    sys.exit(main())
