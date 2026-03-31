/**
 * Cloud Hypervisor backend for Pilox agent isolation.
 *
 * Used for agents requiring:
 *   - GPU passthrough via VFIO (NVIDIA Turing/Ampere/Hopper/Lovelace)
 *   - Confidential computing via CoCo (Intel TDX / AMD SEV-SNP)
 *
 * Architecture:
 *   - Uses cloud-hypervisor binary (Apache 2.0, Rust, Linux Foundation)
 *   - REST API on Unix domain socket (similar to Firecracker API)
 *   - GPU assigned via VFIO PCI passthrough (requires IOMMU)
 *   - CoCo via TDX/SEV-SNP firmware (OVMF)
 *   - vsock for agent ↔ host inference communication (same as Firecracker)
 *   - Boot time ~200ms (vs ~125ms Firecracker)
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
  cleanupStaleIPAllocations,
  execFileAsync,
  INFERENCE_VSOCK_PORT,
} from "./vm-common";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("cloud-hypervisor");

// ── Constants ─────────────────────────────────────────────

const CH_BIN = process.env.CH_BIN || "/usr/local/bin/cloud-hypervisor";
const CH_BASE_DIR = process.env.CH_BASE_DIR || "/var/lib/pilox/cloud-hypervisor";
const CH_KERNEL_PATH =
  process.env.CH_KERNEL_PATH || `${CH_BASE_DIR}/kernels/vmlinux`;
const CH_INSTANCES_DIR = `${CH_BASE_DIR}/instances`;
const CH_IMAGES_CACHE_DIR = `${CH_BASE_DIR}/images`;

// CoCo firmware paths
const CH_TDX_FIRMWARE = process.env.CH_TDX_FIRMWARE || "/usr/share/ovmf/OVMF_TDX.fd";
const CH_SEV_FIRMWARE = process.env.CH_SEV_FIRMWARE || "/usr/share/ovmf/OVMF_SEV.fd";
const CH_COCO_ENABLED = process.env.CH_COCO_ENABLED === "true";
const CH_COCO_TYPE = process.env.CH_COCO_TYPE as "tdx" | "sev-snp" | undefined;

// Default GPU PCI BDF — admin-configured, used when gpuEnabled but no BDF specified
const CH_GPU_PCI_BDF = process.env.CH_GPU_PCI_BDF || "";

// Rate limiting (same as Firecracker)
const MAX_CONCURRENT_CREATES = 5;
let activeCreates = 0;

// VFIO PCI BDF validation
const SAFE_PCI_BDF_RE = /^[0-9a-fA-F]{4}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}\.[0-9a-fA-F]$/;

function assertSafePCIBDF(bdf: string): void {
  if (!SAFE_PCI_BDF_RE.test(bdf)) {
    throw new Error(`Invalid PCI BDF address: "${bdf}" — must match ${SAFE_PCI_BDF_RE}`);
  }
}

// ── Cloud Hypervisor REST API ─────────────────────────────

async function chAPI(
  socketPath: string,
  method: string,
  apiPath: string,
  body?: unknown,
  timeoutMs = 30_000
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      socketPath,
      path: `/api/v1${apiPath}`,
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      timeout: timeoutMs,
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Cloud Hypervisor API ${res.statusCode}: ${data}`));
          return;
        }
        try {
          resolve(data ? JSON.parse(data) : null);
        } catch {
          resolve(data);
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Cloud Hypervisor API timeout after ${timeoutMs}ms: ${method} ${apiPath}`));
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Agent VM Lifecycle ────────────────────────────────────

async function createVM(opts: CreateVMOpts): Promise<CreateVMResult> {
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

    const instanceDir = path.join(CH_INSTANCES_DIR, vmId);
    await mkdir(instanceDir, { recursive: true });
    await mkdir(path.join(instanceDir, "logs"), { recursive: true });

    // Prepare rootfs
    const rootfsPath = path.join(instanceDir, "rootfs.ext4");
    await prepareRootfs(opts.image, rootfsPath, CH_IMAGES_CACHE_DIR);

    // Inject env vars
    const envVars: Record<string, string> = {
      INFERENCE_URL: `http://localhost:${INFERENCE_VSOCK_PORT}`,
      INFERENCE_PORT: String(INFERENCE_VSOCK_PORT),
      ...(opts.envVars || {}),
    };
    await injectEnvVars(rootfsPath, envVars);

    // Allocate networking + vsock CID
    const { ipAddress, cid } = await allocateIPAndCID(vmId);
    tapDevice = await createTapDevice(vmId);

    await configureNetworkInRootfs(rootfsPath, ipAddress);
    await applyVMFirewallRules(tapDevice, ipAddress);

    // Build Cloud Hypervisor config
    const vcpuCount = Math.max(
      1,
      Math.min(16, Math.floor(parseFloat(opts.cpuLimit || "1.0")))
    );
    const memSizeMib = Math.min(
      32768,
      parseMemoryLimitMiB(opts.memoryLimit || "512m")
    );

    // Kernel path: absolute (CH doesn't use jailer chroot)
    const kernelPath = CH_KERNEL_PATH;
    await safeLink(kernelPath, path.join(instanceDir, "vmlinux"));

    const chConfig: Record<string, unknown> = {
      payload: {
        kernel: path.join(instanceDir, "vmlinux"),
        cmdline: "console=ttyS0 reboot=k panic=1 init=/sbin/init quiet loglevel=4",
      },
      disks: [
        {
          path: rootfsPath,
          readonly: false,
        },
      ],
      cpus: {
        boot_vcpus: vcpuCount,
        max_vcpus: vcpuCount,
      },
      memory: {
        size: memSizeMib * 1024 * 1024, // CH expects bytes
      },
      net: [
        {
          tap: tapDevice,
          mac: generateMAC(vmId, "AA:CH:00"),
        },
      ],
      vsock: {
        cid: cid,
        socket: path.join(instanceDir, "vsock.sock"),
      },
      serial: {
        mode: "File",
        file: path.join(instanceDir, "logs", "serial.log"),
      },
      console: {
        mode: "Off",
      },
    };

    // GPU passthrough via VFIO
    const gpuBDF = opts.gpuDevicePCI || CH_GPU_PCI_BDF;
    if (opts.gpuPassthrough && gpuBDF) {
      assertSafePCIBDF(gpuBDF);
      chConfig.devices = [
        {
          path: `/sys/bus/pci/devices/${gpuBDF}`,
        },
      ];
    }

    // Confidential computing
    if (opts.confidential && CH_COCO_ENABLED && CH_COCO_TYPE) {
      if (CH_COCO_TYPE === "tdx") {
        chConfig.platform = { tdx: true };
        // TDX requires OVMF firmware instead of raw kernel
        (chConfig.payload as Record<string, unknown>).firmware = CH_TDX_FIRMWARE;
        delete (chConfig.payload as Record<string, unknown>).kernel;
      } else if (CH_COCO_TYPE === "sev-snp") {
        chConfig.platform = { sev_snp: true };
        (chConfig.payload as Record<string, unknown>).firmware = CH_SEV_FIRMWARE;
        delete (chConfig.payload as Record<string, unknown>).kernel;
      }
    }

    await writeFile(
      path.join(instanceDir, "config.json"),
      JSON.stringify(chConfig, null, 2)
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
      hypervisor: "cloud-hypervisor",
    };
    await writeFile(
      path.join(instanceDir, "metadata.json"),
      JSON.stringify(metadata, null, 2)
    );

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
      await rm(path.join(CH_INSTANCES_DIR, vmId), { recursive: true, force: true }).catch((e) => {
        log.warn("Cleanup failed", { error: e instanceof Error ? e.message : String(e) });
      });
    }
    throw err;
  } finally {
    activeCreates--;
  }
}

async function startVM(vmId: string): Promise<void> {
  assertSafeId(vmId, "vmId");

  const instanceDir = path.join(CH_INSTANCES_DIR, vmId);
  await access(instanceDir);

  const metadata = await readMetadata(vmId);

  // Recreate tap device if cleaned up
  try {
    await execFileAsync("ip", ["link", "show", metadata.tapDevice]);
  } catch {
    await createTapDevice(vmId, metadata.tapDevice);
    await applyVMFirewallRules(metadata.tapDevice, metadata.ipAddress);
  }

  // Remove stale socket
  const socketPath = path.join(instanceDir, "ch.sock");
  await rm(socketPath, { force: true });

  // Launch cloud-hypervisor — no shell, validated args only
  const configPath = path.join(instanceDir, "config.json");
  const ch = spawn(
    CH_BIN,
    [
      "--api-socket",
      socketPath,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    }
  );

  // Capture stderr for debugging
  const errLog = createWriteStream(path.join(instanceDir, "logs", "ch-stderr.log"), {
    flags: "a",
    mode: 0o640,
  });
  ch.stderr?.pipe(errLog);
  ch.stdout?.pipe(errLog);
  ch.unref();

  if (ch.pid) {
    await writeFile(path.join(instanceDir, "pid"), String(ch.pid), {
      mode: 0o640,
    });
  }

  // Wait for API socket to be ready
  await waitForSocket(socketPath, 15_000, "Cloud Hypervisor");

  // Create the VM via API (send full config)
  const config = JSON.parse(await readFile(configPath, "utf-8"));
  await chAPI(socketPath, "PUT", "/vm.create", config);

  // Boot the VM
  await chAPI(socketPath, "PUT", "/vm.boot", null);
}

async function stopVM(vmId: string): Promise<void> {
  assertSafeId(vmId, "vmId");
  const instanceDir = path.join(CH_INSTANCES_DIR, vmId);
  const socketPath = path.join(instanceDir, "ch.sock");

  // Try graceful shutdown via CH API
  try {
    await chAPI(socketPath, "PUT", "/vm.shutdown", null);
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

  // Clean up runtime files
  await rm(path.join(instanceDir, "pid"), { force: true });
  await rm(socketPath, { force: true });
}

async function pauseVM(vmId: string): Promise<void> {
  assertSafeId(vmId, "vmId");
  const socketPath = path.join(CH_INSTANCES_DIR, vmId, "ch.sock");
  await chAPI(socketPath, "PUT", "/vm.pause", null);
}

async function resumeVM(vmId: string): Promise<void> {
  assertSafeId(vmId, "vmId");
  const socketPath = path.join(CH_INSTANCES_DIR, vmId, "ch.sock");
  await chAPI(socketPath, "PUT", "/vm.resume", null);
}

async function destroyVM(vmId: string): Promise<void> {
  assertSafeId(vmId, "vmId");
  await stopVM(vmId).catch((e) => {
    log.warn("stopVM failed", { error: e instanceof Error ? e.message : String(e) });
  });
  await releaseIP(vmId);
  await rm(path.join(CH_INSTANCES_DIR, vmId), { recursive: true, force: true });
}

function getVMLogs(vmId: string): Readable {
  assertSafeId(vmId, "vmId");
  const serialLogPath = path.join(CH_INSTANCES_DIR, vmId, "logs", "serial.log");

  // Verify the log file is within the expected directory (prevent path traversal)
  const resolvedPath = path.resolve(serialLogPath);
  if (!resolvedPath.startsWith(path.resolve(CH_INSTANCES_DIR))) {
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

async function getVMStats(vmId: string): Promise<VMStats | null> {
  assertSafeId(vmId, "vmId");
  const instanceDir = path.join(CH_INSTANCES_DIR, vmId);

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
    const memLimitBytes = config.memory?.size || 512 * 1024 * 1024;

    // Network stats
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

async function checkCloudHypervisorHealth(): Promise<void> {
  try {
    await access("/dev/kvm");
  } catch {
    throw new Error(
      "KVM unavailable (/dev/kvm). Cloud Hypervisor microVMs need Linux with KVM. Other Pilox features work without KVM."
    );
  }

  try {
    await execFileAsync(CH_BIN, ["--version"]);
  } catch {
    throw new Error(`Cloud Hypervisor binary not found at ${CH_BIN}`);
  }

  // Check IOMMU if GPU passthrough is expected
  if (process.env.CH_GPU_PCI_BDF) {
    try {
      await access("/sys/kernel/iommu_groups");
    } catch {
      throw new Error("IOMMU is not available. GPU passthrough requires IOMMU (intel_iommu=on or amd_iommu=on).");
    }
  }
}

async function getRunningVMCount(): Promise<{
  total: number;
  running: number;
  stopped: number;
}> {
  try {
    const entries = await readdir(CH_INSTANCES_DIR);
    let running = 0;
    const total = entries.length;

    for (const entry of entries) {
      if (await isProcessAlive(path.join(CH_INSTANCES_DIR, entry, "pid"))) {
        running++;
      }
    }

    return { total, running, stopped: total - running };
  } catch {
    return { total: 0, running: 0, stopped: 0 };
  }
}

async function listRunningVMs(): Promise<
  Array<VMMetadata & { status: string }>
> {
  try {
    const entries = await readdir(CH_INSTANCES_DIR);
    const vms: Array<VMMetadata & { status: string }> = [];

    for (const entry of entries) {
      try {
        const metadata = await readMetadata(entry);
        let status = "stopped";
        if (await isProcessAlive(path.join(CH_INSTANCES_DIR, entry, "pid"))) {
          status = "running";
          // Check pause state via CH API
          try {
            const socketPath = path.join(CH_INSTANCES_DIR, entry, "ch.sock");
            const vmInfo = await chAPI(socketPath, "GET", "/vm.info", null) as { state?: string };
            if (vmInfo?.state === "Paused") {
              status = "paused";
            }
          } catch {
            // API unreachable — assume running
          }
        }
        vms.push({ ...metadata, status });
      } catch {
        /* skip invalid */
      }
    }

    return vms;
  } catch {
    return [];
  }
}

async function getVMMetadataFn(vmId: string): Promise<{ vsockCID: number; ipAddress: string }> {
  const meta = await readMetadata(vmId);
  return { vsockCID: meta.vsockCID, ipAddress: meta.ipAddress };
}

// ── Internal helpers ──────────────────────────────────────

async function readMetadata(vmId: string): Promise<VMMetadata> {
  assertSafeId(vmId, "vmId");
  return JSON.parse(
    await readFile(path.join(CH_INSTANCES_DIR, vmId, "metadata.json"), "utf-8")
  );
}

// ── VM Watchdog ───────────────────────────────────────────

async function cleanupOrphanedVMs(): Promise<{
  cleaned: string[];
  errors: string[];
}> {
  const cleaned: string[] = [];
  const errors: string[] = [];

  try {
    const entries = await readdir(CH_INSTANCES_DIR);

    for (const entry of entries) {
      try {
        const pidFile = path.join(CH_INSTANCES_DIR, entry, "pid");
        if (await isProcessAlive(pidFile)) continue;

        try {
          const metadata = await readMetadata(entry);
          await destroyTapDevice(metadata.tapDevice).catch((e) => {
        log.warn("Cleanup failed", { error: e instanceof Error ? e.message : String(e) });
      });
          await removeVMFirewallRules(metadata.tapDevice, metadata.ipAddress).catch((e) => {
        log.warn("Cleanup failed", { error: e instanceof Error ? e.message : String(e) });
      });
          await rm(pidFile, { force: true });
          await rm(path.join(CH_INSTANCES_DIR, entry, "ch.sock"), { force: true });
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

    await cleanupStaleIPAllocations(CH_INSTANCES_DIR);
  } catch {
    // CH_INSTANCES_DIR may not exist yet
  }

  return { cleaned, errors };
}

// ── Factory ───────────────────────────────────────────────

export function createCloudHypervisorBackend(): HypervisorBackend {
  return {
    name: "cloud-hypervisor",
    createVM,
    startVM,
    stopVM,
    pauseVM,
    resumeVM,
    destroyVM,
    getVMLogs,
    getVMStats,
    getVMMetadata: getVMMetadataFn,
    checkHealth: checkCloudHypervisorHealth,
    getRunningVMCount,
    listRunningVMs,
    cleanupOrphanedVMs,
  };
}
