// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Firecracker microVM management for Pilox agent isolation.
 *
 * Security features:
 *   - Jailer: each VM runs in a chroot with cgroup isolation + seccomp
 *   - Input sanitization: all shell args validated against strict patterns
 *   - File-locked IP allocation: prevents race conditions
 *   - Copy-on-write rootfs: reflink/sparse copies to save disk space
 *   - Per-VM iptables isolation: VMs cannot communicate with each other
 *   - Rate limiting: max concurrent VM creations
 */

import http from "node:http";
import { createWriteStream } from "node:fs";
import { spawn } from "node:child_process";
import {
  readFile,
  writeFile,
  mkdir,
  rm,
  access,
  readdir,
  chmod,
} from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { sanitizeContainerName } from "./request-utils";
import type { HypervisorBackend, VMMetadata, CreateVMOpts, CreateVMResult, VMStats } from "./hypervisor";
import {
  assertSafeId,
  assertSafeTap,
  assertSafeIP,
  assertSafeImage,
  allocateIPAndCID,
  releaseIP,
  cleanupStaleIPAllocations,
  createTapDevice,
  destroyTapDevice,
  applyVMFirewallRules,
  removeVMFirewallRules,
  configureNetworkInRootfs,
  prepareRootfs,
  injectEnvVars,
  safeLink,
  generateVMId,
  generateMAC,
  parseMemoryLimitMiB,
  sleep,
  waitForSocket,
  waitForProcessExit,
  forceKillByPidFile,
  isProcessAlive,
  execFileAsync,
  INFERENCE_VSOCK_PORT,
} from "./vm-common";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("firecracker");

// ── Constants ─────────────────────────────────────────────

const FC_BIN = process.env.FC_BIN || "/usr/local/bin/firecracker";
const JAILER_BIN = process.env.FC_JAILER_BIN || "/usr/local/bin/jailer";
const FC_BASE_DIR = process.env.FC_BASE_DIR || "/var/lib/pilox/firecracker";
const KERNEL_PATH =
  process.env.FC_KERNEL_PATH || `${FC_BASE_DIR}/kernels/vmlinux`;
const INSTANCES_DIR = `${FC_BASE_DIR}/instances`;
const IMAGES_CACHE_DIR = `${FC_BASE_DIR}/images`;
const BRIDGE_NAME = process.env.FC_BRIDGE || "pilox-br0";

const JAILER_UID = parseInt(process.env.FC_JAILER_UID || "1500");
const JAILER_GID = parseInt(process.env.FC_JAILER_GID || "1500");
const JAILER_CHROOT_BASE = "/srv/jailer";

// Rate limiting
const MAX_CONCURRENT_CREATES = 5;
let activeCreates = 0;

// ── Agent VM Lifecycle ────────────────────────────────────

/**
 * Create a new agent microVM with full jailer isolation.
 * Prepares a CoW rootfs, allocates networking with per-VM firewall rules,
 * and writes the Firecracker config. Does NOT start the VM.
 */
export async function createAgentVM(opts: CreateVMOpts): Promise<CreateVMResult> {
  // Rate limiting
  if (activeCreates >= MAX_CONCURRENT_CREATES) {
    throw new Error(
      `Too many concurrent VM creations (max ${MAX_CONCURRENT_CREATES}). Try again shortly.`
    );
  }
  activeCreates++;

  let vmId: string | undefined;
  let tapDevice: string | undefined;

  try {
    assertSafeImage(opts.image);

    const safeName = sanitizeContainerName(opts.name);
    vmId = generateVMId(safeName);
    assertSafeId(vmId, "vmId");

    const instanceDir = path.join(INSTANCES_DIR, vmId);
    await mkdir(instanceDir, { recursive: true });
    await mkdir(path.join(instanceDir, "logs"), { recursive: true });

    // Prepare rootfs from Docker image (copy-on-write when possible)
    const rootfsPath = path.join(instanceDir, "rootfs.ext4");
    await prepareRootfs(opts.image, rootfsPath, IMAGES_CACHE_DIR);

    // Inject env vars into rootfs (names validated)
    const envVars: Record<string, string> = {
      INFERENCE_URL: `http://localhost:${INFERENCE_VSOCK_PORT}`,
      INFERENCE_PORT: String(INFERENCE_VSOCK_PORT),
      ...(opts.envVars || {}),
    };
    await injectEnvVars(rootfsPath, envVars);

    // Allocate networking + vsock CID with file lock
    const { ipAddress, cid } = await allocateIPAndCID(vmId);
    tapDevice = await createTapDevice(vmId);

    // Configure the IP inside the rootfs
    await configureNetworkInRootfs(rootfsPath, ipAddress);

    // Apply per-VM firewall rules (isolate from other VMs)
    await applyVMFirewallRules(tapDevice, ipAddress);

    // Build Firecracker config
    const vcpuCount = Math.max(
      1,
      Math.min(16, Math.floor(parseFloat(opts.cpuLimit || "1.0")))
    );
    const memSizeMib = Math.min(
      32768,
      parseMemoryLimitMiB(opts.memoryLimit || "512m")
    );

    const fcConfig = {
      "boot-source": {
        kernel_image_path: "vmlinux",
        boot_args:
          "console=ttyS0 reboot=k panic=1 pci=off init=/sbin/init quiet loglevel=4",
      },
      drives: [
        {
          drive_id: "rootfs",
          path_on_host: "rootfs.ext4",
          is_root_device: true,
          is_read_only: false,
        },
      ],
      "machine-config": {
        vcpu_count: vcpuCount,
        mem_size_mib: memSizeMib,
      },
      "network-interfaces": [
        {
          iface_id: "eth0",
          guest_mac: generateMAC(vmId),
          host_dev_name: tapDevice,
        },
      ],
      vsock: {
        vsock_id: "vsock0",
        guest_cid: cid,
        uds_path: "vsock.sock",
      },
    };

    await writeFile(
      path.join(instanceDir, "config.json"),
      JSON.stringify(fcConfig, null, 2)
    );

    // Store metadata
    const metadata: VMMetadata = {
      vmId,
      name: safeName,
      image: opts.image,
      ipAddress,
      tapDevice,
      vsockCID: cid,
      createdAt: new Date().toISOString(),
      hypervisor: "firecracker",
    };
    await writeFile(
      path.join(instanceDir, "metadata.json"),
      JSON.stringify(metadata, null, 2)
    );

    // Restrict instance directory permissions
    await chmod(instanceDir, 0o750);

    return { vmId, ipAddress, vsockCID: cid };
  } catch (err) {
    // Rollback partially created resources
    if (vmId) {
      if (tapDevice) {
        await destroyTapDevice(tapDevice).catch((e) => {
        log.warn("Cleanup failed", { error: e instanceof Error ? e.message : String(e) });
      });
        await removeVMFirewallRules(tapDevice, "").catch((e) => {
        log.warn("Cleanup failed", { error: e instanceof Error ? e.message : String(e) });
      });
      }
      await releaseIP(vmId).catch((e) => {
        log.warn("Cleanup failed", { error: e instanceof Error ? e.message : String(e) });
      });
      await rm(path.join(INSTANCES_DIR, vmId), { recursive: true, force: true }).catch((e) => {
        log.warn("Cleanup failed", { error: e instanceof Error ? e.message : String(e) });
      });
    }
    throw err;
  } finally {
    activeCreates--;
  }
}

/**
 * Start a previously created microVM via the Firecracker jailer.
 */
export async function startVM(vmId: string): Promise<void> {
  assertSafeId(vmId, "vmId");

  const instanceDir = path.join(INSTANCES_DIR, vmId);
  await access(instanceDir);

  const metadata = await readMetadata(vmId);

  // Recreate tap device if it was cleaned up during a previous stop
  try {
    await execFileAsync("ip", ["link", "show", metadata.tapDevice]);
  } catch {
    await createTapDevice(vmId, metadata.tapDevice);
    await applyVMFirewallRules(metadata.tapDevice, metadata.ipAddress);
  }

  // Prepare jailer chroot directory structure
  const jailDir = path.join(JAILER_CHROOT_BASE, "firecracker", vmId);
  const jailRoot = path.join(jailDir, "root");
  await mkdir(jailRoot, { recursive: true });

  // Hard-link (or CoW copy) files into the jailer chroot
  await safeLink(KERNEL_PATH, path.join(jailRoot, "vmlinux"));
  await safeLink(
    path.join(instanceDir, "rootfs.ext4"),
    path.join(jailRoot, "rootfs.ext4")
  );
  await safeLink(
    path.join(instanceDir, "config.json"),
    path.join(jailRoot, "config.json")
  );

  // Set ownership so jailer UID can access them
  await execFileAsync("chown", [
    "-R",
    `${JAILER_UID}:${JAILER_GID}`,
    jailRoot,
  ]);

  // Remove stale socket
  const socketPath = path.join(jailRoot, "firecracker.sock");
  await rm(socketPath, { force: true });

  // Capture serial console output
  const serialLogPath = path.join(instanceDir, "logs", "serial.log");
  const serialLog = createWriteStream(serialLogPath, {
    flags: "a",
    mode: 0o640,
  });

  // Launch via jailer — no shell involved, all args are validated
  const fc = spawn(
    JAILER_BIN,
    [
      "--id",
      vmId,
      "--exec-file",
      FC_BIN,
      "--uid",
      String(JAILER_UID),
      "--gid",
      String(JAILER_GID),
      "--chroot-base-dir",
      JAILER_CHROOT_BASE,
      "--",
      "--api-sock",
      "/firecracker.sock",
      "--config-file",
      "/config.json",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    }
  );

  fc.stdout?.pipe(serialLog);
  fc.stderr?.pipe(serialLog);
  fc.unref();

  if (fc.pid) {
    await writeFile(path.join(instanceDir, "pid"), String(fc.pid), {
      mode: 0o640,
    });
  }

  await waitForSocket(socketPath, 15_000, "Firecracker");
}

/**
 * Stop a running microVM. Graceful shutdown via API, then SIGKILL fallback.
 * Cleans up tap device, firewall rules, and jailer chroot.
 */
export async function stopVM(vmId: string): Promise<void> {
  assertSafeId(vmId, "vmId");
  const instanceDir = path.join(INSTANCES_DIR, vmId);

  // Try graceful shutdown via Firecracker API
  const jailRoot = path.join(
    JAILER_CHROOT_BASE,
    "firecracker",
    vmId,
    "root"
  );
  const socketPath = path.join(jailRoot, "firecracker.sock");

  try {
    await firecrackerAPI(socketPath, "PUT", "/actions", {
      action_type: "SendCtrlAltDel",
    });
    const pidFile = path.join(instanceDir, "pid");
    const exited = await waitForProcessExit(pidFile, 10_000);
    if (!exited) {
      await forceKillByPidFile(pidFile);
    }
  } catch {
    await forceKillByPidFile(path.join(instanceDir, "pid"));
  }

  // Clean up networking
  try {
    const metadata = await readMetadata(vmId);
    await removeVMFirewallRules(metadata.tapDevice, metadata.ipAddress);
    await destroyTapDevice(metadata.tapDevice);
  } catch {
    // Tap/rules may already be gone
  }

  // Clean up jailer chroot
  await rm(path.join(JAILER_CHROOT_BASE, "firecracker", vmId), {
    recursive: true,
    force: true,
  });

  // Clean up runtime files
  await rm(path.join(instanceDir, "pid"), { force: true });
}

/**
 * Pause a running microVM. vCPUs stop, memory stays resident.
 */
export async function pauseVM(vmId: string): Promise<void> {
  assertSafeId(vmId, "vmId");
  const socketPath = path.join(JAILER_CHROOT_BASE, "firecracker", vmId, "root", "firecracker.sock");
  await firecrackerAPI(socketPath, "PATCH", "/vm", { state: "Paused" });
}

/**
 * Resume a previously paused microVM.
 */
export async function resumeVM(vmId: string): Promise<void> {
  assertSafeId(vmId, "vmId");
  const socketPath = path.join(JAILER_CHROOT_BASE, "firecracker", vmId, "root", "firecracker.sock");
  await firecrackerAPI(socketPath, "PATCH", "/vm", { state: "Resumed" });
}

/**
 * Destroy a microVM: stop, release IP, delete all instance data.
 */
export async function destroyVM(vmId: string): Promise<void> {
  assertSafeId(vmId, "vmId");
  await stopVM(vmId).catch((e) => {
    log.warn("Stop VM failed", { error: e instanceof Error ? e.message : String(e) });
  });
  await releaseIP(vmId);
  await rm(path.join(INSTANCES_DIR, vmId), { recursive: true, force: true });
}

/**
 * Get a readable stream of the VM's serial console output.
 */
export function getVMLogs(vmId: string): Readable {
  assertSafeId(vmId, "vmId");
  const serialLogPath = path.join(INSTANCES_DIR, vmId, "logs", "serial.log");

  // Verify the log file is within the expected directory (prevent path traversal)
  const resolvedPath = path.resolve(serialLogPath);
  if (!resolvedPath.startsWith(path.resolve(INSTANCES_DIR))) {
    throw new Error("Invalid log path");
  }

  const tail = spawn("tail", ["-f", "-n", "100", resolvedPath]);

  // Ensure the child process is cleaned up when the stream ends or errors
  const stream = tail.stdout;
  const cleanup = () => {
    if (!tail.killed) {
      tail.kill("SIGTERM");
    }
  };
  stream.on("close", cleanup);
  stream.on("error", cleanup);
  tail.on("error", cleanup);

  return stream;
}

/**
 * Get resource usage stats for a running VM.
 */
export async function getVMStats(vmId: string): Promise<VMStats | null> {
  assertSafeId(vmId, "vmId");
  const instanceDir = path.join(INSTANCES_DIR, vmId);

  try {
    const pidStr = await readFile(path.join(instanceDir, "pid"), "utf-8");
    const pid = parseInt(pidStr.trim());
    if (!Number.isFinite(pid) || pid <= 0) return null;

    // Memory from /proc/{pid}/status
    let memUsage = 0;
    try {
      const procStatus = await readFile(`/proc/${pid}/status`, "utf-8");
      const vmRSSMatch = procStatus.match(/VmRSS:\s+(\d+)/);
      if (vmRSSMatch) memUsage = parseInt(vmRSSMatch[1]) * 1024;
    } catch {
      /* process exited */
    }

    // Memory limit from config
    const config = JSON.parse(
      await readFile(path.join(instanceDir, "config.json"), "utf-8")
    );
    const memLimitBytes =
      (config["machine-config"]?.mem_size_mib || 512) * 1024 * 1024;

    // Network stats (pure file reads)
    const metadata = await readMetadata(vmId);
    assertSafeTap(metadata.tapDevice);
    let rxBytes = 0;
    let txBytes = 0;
    try {
      rxBytes =
        parseInt(
          await readFile(
            `/sys/class/net/${metadata.tapDevice}/statistics/rx_bytes`,
            "utf-8"
          )
        ) || 0;
      txBytes =
        parseInt(
          await readFile(
            `/sys/class/net/${metadata.tapDevice}/statistics/tx_bytes`,
            "utf-8"
          )
        ) || 0;
    } catch {
      /* tap gone */
    }

    // CPU from /proc/{pid}/stat
    let cpuPercent = 0;
    try {
      const procStat = await readFile(`/proc/${pid}/stat`, "utf-8");
      const fields = procStat.split(" ");
      const utime = parseInt(fields[13]);
      const stime = parseInt(fields[14]);
      const starttime = parseInt(fields[21]);
      const uptime = parseFloat(await readFile("/proc/uptime", "utf-8"));
      const hertz = 100;
      const totalTime = utime + stime;
      const elapsedSec = uptime - starttime / hertz;
      if (elapsedSec > 0) {
        cpuPercent =
          Math.round((totalTime / hertz / elapsedSec) * 100 * 100) / 100;
      }
    } catch {
      /* process exited */
    }

    return {
      cpu: { percent: cpuPercent },
      memory: {
        usage: memUsage,
        limit: memLimitBytes,
        percent:
          memLimitBytes > 0
            ? Math.round((memUsage / memLimitBytes) * 10000) / 100
            : 0,
      },
      network: { rxBytes, txBytes },
    };
  } catch {
    return null;
  }
}

// ── System-level queries ──────────────────────────────────

export async function checkFirecrackerHealth(): Promise<void> {
  try {
    await access("/dev/kvm");
  } catch {
    throw new Error(
      "KVM unavailable (/dev/kvm). Firecracker microVMs need Linux with KVM (nested virt on VPS if applicable). Other Pilox features work without KVM."
    );
  }

  try {
    await execFileAsync(FC_BIN, ["--version"]);
  } catch {
    throw new Error(`Firecracker binary not found at ${FC_BIN}`);
  }

  try {
    await execFileAsync(JAILER_BIN, ["--version"]);
  } catch {
    throw new Error(`Jailer binary not found at ${JAILER_BIN}`);
  }

  try {
    await execFileAsync("ip", ["link", "show", BRIDGE_NAME]);
  } catch {
    throw new Error(`VM bridge ${BRIDGE_NAME} is not up`);
  }
}

export async function getRunningVMCount(): Promise<{
  total: number;
  running: number;
  stopped: number;
}> {
  try {
    const entries = await readdir(INSTANCES_DIR);
    let running = 0;
    const total = entries.length;

    for (const entry of entries) {
      if (await isProcessAlive(path.join(INSTANCES_DIR, entry, "pid"))) {
        running++;
      }
    }

    return { total, running, stopped: total - running };
  } catch {
    return { total: 0, running: 0, stopped: 0 };
  }
}

export async function listRunningVMs(): Promise<
  Array<VMMetadata & { status: string }>
> {
  try {
    const entries = await readdir(INSTANCES_DIR);
    const vms: Array<VMMetadata & { status: string }> = [];

    for (const entry of entries) {
      try {
        const metadata = await readMetadata(entry);
        let status = "stopped";
        if (await isProcessAlive(path.join(INSTANCES_DIR, entry, "pid"))) {
          status = "running";
          try {
            const socketPath = path.join(JAILER_CHROOT_BASE, "firecracker", entry, "root", "firecracker.sock");
            const vmState = await firecrackerAPI(socketPath, "GET", "/vm") as { state?: string };
            if (vmState?.state === "Paused") {
              status = "paused";
            }
          } catch {
            // API unreachable — assume running
          }
        }
        vms.push({ ...metadata, hypervisor: "firecracker", status });
      } catch {
        /* skip invalid */
      }
    }

    return vms;
  } catch {
    return [];
  }
}

export async function getVMMetadata(vmId: string): Promise<{ vsockCID: number; ipAddress: string }> {
  const meta = await readMetadata(vmId);
  return { vsockCID: meta.vsockCID, ipAddress: meta.ipAddress };
}

// ── Firecracker API ───────────────────────────────────────

async function firecrackerAPI(
  socketPath: string,
  method: string,
  apiPath: string,
  body?: unknown,
  timeoutMs = 30_000
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      socketPath,
      path: apiPath,
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      timeout: timeoutMs,
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Firecracker API ${res.statusCode}: ${data}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Firecracker API timeout after ${timeoutMs}ms: ${method} ${apiPath}`));
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Internal helpers ──────────────────────────────────────

async function readMetadata(vmId: string): Promise<VMMetadata> {
  assertSafeId(vmId, "vmId");
  return JSON.parse(
    await readFile(path.join(INSTANCES_DIR, vmId, "metadata.json"), "utf-8")
  );
}

// ── VM Watchdog ───────────────────────────────────────────

export async function cleanupOrphanedVMs(): Promise<{
  cleaned: string[];
  errors: string[];
}> {
  const cleaned: string[] = [];
  const errors: string[] = [];

  try {
    const entries = await readdir(INSTANCES_DIR);

    for (const entry of entries) {
      try {
        const pidFile = path.join(INSTANCES_DIR, entry, "pid");
        if (await isProcessAlive(pidFile)) continue;

        // VM is dead — clean up orphaned resources
        try {
          const metadata = await readMetadata(entry);
          await destroyTapDevice(metadata.tapDevice).catch((e) => {
        log.warn("Cleanup failed", { error: e instanceof Error ? e.message : String(e) });
      });
          await removeVMFirewallRules(metadata.tapDevice, metadata.ipAddress).catch((e) => {
        log.warn("Cleanup failed", { error: e instanceof Error ? e.message : String(e) });
      });
          await rm(path.join(JAILER_CHROOT_BASE, "firecracker", entry), {
            recursive: true,
            force: true,
          }).catch((e) => {
        log.warn("Cleanup failed", { error: e instanceof Error ? e.message : String(e) });
      });
          await rm(pidFile, { force: true });
          cleaned.push(entry);
        } catch {
          await rm(pidFile, { force: true }).catch((e) => {
        log.warn("Cleanup failed", { error: e instanceof Error ? e.message : String(e) });
      });
          cleaned.push(entry);
        }
      } catch (err) {
        errors.push(`${entry}: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }

    // Clean up IP allocations for VMs that no longer exist
    await cleanupStaleIPAllocations(INSTANCES_DIR);
  } catch {
    // INSTANCES_DIR may not exist yet
  }

  return { cleaned, errors };
}

// ── Factory ───────────────────────────────────────────────

export function createFirecrackerBackend(): HypervisorBackend {
  return {
    name: "firecracker",
    createVM: createAgentVM,
    startVM,
    stopVM,
    pauseVM,
    resumeVM,
    destroyVM,
    getVMLogs,
    getVMStats,
    getVMMetadata,
    checkHealth: checkFirecrackerHealth,
    getRunningVMCount,
    listRunningVMs,
    cleanupOrphanedVMs,
  };
}

// Re-export types for backward compatibility
export type { VMStats, VMMetadata } from "./hypervisor";
