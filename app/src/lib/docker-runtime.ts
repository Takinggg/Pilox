// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Docker container runtime backend for Pilox agent isolation.
 *
 * Universal fallback when KVM is unavailable (Docker Desktop, cloud VMs
 * without nested virt, macOS, Windows). Containers start in ~1-2s.
 *
 * Firecracker (~125ms boot) remains the premium tier for production
 * bare-metal Linux with KVM.
 */

import { Readable, PassThrough } from "node:stream";
import crypto from "node:crypto";
import type Docker from "dockerode";
import type {
  HypervisorBackend,
  VMMetadata,
  CreateVMOpts,
  CreateVMResult,
  VMStats,
} from "./hypervisor";
import { dockerConnectionFromEnv } from "./docker";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("docker-runtime");

// ── Constants ─────────────────────────────────────────────

const LABEL_MANAGED = "pilox-managed";
const LABEL_AGENT_NAME = "pilox-agent-name";
const LABEL_VM_ID = "pilox-vm-id";
const LABEL_IMAGE = "pilox-agent-image";
const LABEL_CREATED_AT = "pilox-created-at";

/** Docker network for agent containers. Must match docker-compose network. */
const AGENT_NETWORK = process.env.PILOX_DOCKER_NETWORK || "pilox-network";

// Rate limiting
const MAX_CONCURRENT_CREATES = 10;
let activeCreates = 0;

// ── Helpers ───────────────────────────────────────────────

function parseCpuLimit(limit?: string): number {
  if (!limit) return 1;
  const n = parseFloat(limit);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parseMemoryLimit(limit?: string): number {
  if (!limit) return 512 * 1024 * 1024;
  const match = limit.match(/^(\d+(?:\.\d+)?)\s*(b|k|kb|m|mb|g|gb|t|tb)?$/i);
  if (!match) return 512 * 1024 * 1024;
  const val = parseFloat(match[1]);
  const unit = (match[2] || "b").toLowerCase();
  const multipliers: Record<string, number> = {
    b: 1,
    k: 1024,
    kb: 1024,
    m: 1024 ** 2,
    mb: 1024 ** 2,
    g: 1024 ** 3,
    gb: 1024 ** 3,
    t: 1024 ** 4,
    tb: 1024 ** 4,
  };
  return Math.round(val * (multipliers[unit] ?? 1));
}

function generateContainerId(): string {
  return `pilox-agent-${crypto.randomUUID().slice(0, 8)}`;
}

async function getContainerIP(
  container: Docker.Container,
  network: string,
): Promise<string> {
  const info = await container.inspect();
  const nets = info.NetworkSettings?.Networks;
  if (nets?.[network]?.IPAddress) {
    return nets[network].IPAddress;
  }
  // Fallback: try any network
  for (const net of Object.values(nets ?? {})) {
    if ((net as { IPAddress?: string }).IPAddress) {
      return (net as { IPAddress: string }).IPAddress;
    }
  }
  return "0.0.0.0";
}

function piloxFilter(): Record<string, string[]> {
  return { label: [`${LABEL_MANAGED}=true`] };
}

// ── Docker Backend Implementation ─────────────────────────

async function createVM(
  docker: Docker,
  opts: CreateVMOpts,
): Promise<CreateVMResult> {
  if (activeCreates >= MAX_CONCURRENT_CREATES) {
    throw new Error(
      `Too many concurrent container creations (max ${MAX_CONCURRENT_CREATES}). Try again shortly.`,
    );
  }
  activeCreates++;

  try {
    const vmId = generateContainerId();
    const cpuNanos = Math.round(parseCpuLimit(opts.cpuLimit) * 1e9);
    const memBytes = parseMemoryLimit(opts.memoryLimit);

    // Ensure image is available (pull if needed)
    try {
      await docker.getImage(opts.image).inspect();
    } catch {
      // Image not found locally — pull it
      const stream = await docker.pull(opts.image);
      await new Promise<void>((resolve, reject) => {
        docker.modem.followProgress(stream, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    // Build env array
    const envArray = Object.entries(opts.envVars ?? {}).map(
      ([k, v]) => `${k}=${v}`,
    );

    // GPU passthrough: request all GPUs via NVIDIA Container Toolkit
    const deviceRequests =
      opts.gpuEnabled || opts.gpuPassthrough
        ? [
            {
              Driver: "nvidia" as const,
              Count: -1, // all available GPUs
              Capabilities: [["gpu"]] as string[][],
              ...(opts.gpuDevicePCI
                ? { DeviceIDs: [opts.gpuDevicePCI] }
                : {}),
            },
          ]
        : undefined;

    // Persistent volume: agent data survives container restarts
    const volumeName = `pilox-agent-data-${vmId}`;
    const volumeBinds = [`${volumeName}:/data`];

    const container = await docker.createContainer({
      name: vmId,
      Image: opts.image,
      Env: envArray,
      Labels: {
        [LABEL_MANAGED]: "true",
        [LABEL_AGENT_NAME]: opts.name,
        [LABEL_VM_ID]: vmId,
        [LABEL_IMAGE]: opts.image,
        [LABEL_CREATED_AT]: new Date().toISOString(),
      },
      HostConfig: {
        NanoCpus: cpuNanos,
        Memory: memBytes,
        MemorySwap: memBytes * 2, // allow 2x swap to prevent OOM kills
        PidsLimit: 512, // prevent fork bombs
        RestartPolicy: { Name: "unless-stopped", MaximumRetryCount: 0 },
        Binds: volumeBinds,
        DeviceRequests: deviceRequests,
        SecurityOpt: ["no-new-privileges:true"],
        CapDrop: ["ALL"],
        CapAdd: ["NET_BIND_SERVICE"], // only allow binding to ports < 1024
        ReadonlyRootfs: false, // agents may need to write temp files
      },
    });

    // Attach to pilox-network
    try {
      const network = docker.getNetwork(AGENT_NETWORK);
      await network.connect({ Container: container.id });
    } catch (e) {
      log.warn("Could not attach container to agent network", {
        network: AGENT_NETWORK,
        containerId: container.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    await container.start();

    const ipAddress = await getContainerIP(container, AGENT_NETWORK);

    return { vmId, ipAddress, vsockCID: 0 };
  } finally {
    activeCreates--;
  }
}

async function startVMImpl(
  docker: Docker,
  vmId: string,
): Promise<void> {
  const container = docker.getContainer(vmId);
  await container.start();
}

async function stopVMImpl(
  docker: Docker,
  vmId: string,
): Promise<void> {
  const container = docker.getContainer(vmId);
  await container.stop({ t: 10 });
}

async function pauseVMImpl(
  docker: Docker,
  vmId: string,
): Promise<void> {
  const container = docker.getContainer(vmId);
  await container.pause();
}

async function resumeVMImpl(
  docker: Docker,
  vmId: string,
): Promise<void> {
  const container = docker.getContainer(vmId);
  await container.unpause();
}

async function destroyVMImpl(
  docker: Docker,
  vmId: string,
): Promise<void> {
  const container = docker.getContainer(vmId);
  try {
    await container.stop({ t: 5 });
  } catch {
    // Already stopped
  }
  await container.remove({ force: true });
}

function getVMLogsImpl(
  docker: Docker,
  vmId: string,
): Readable {
  const container = docker.getContainer(vmId);
  const pass = new PassThrough();

  container
    .logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail: 100,
    })
    .then((stream) => {
      // Docker multiplexed stream — demux stdout/stderr
      container.modem.demuxStream(stream, pass, pass);
      (stream as NodeJS.ReadableStream & { on: (event: string, cb: () => void) => void }).on("end", () => pass.end());
    })
    .catch((err) => {
      pass.destroy(err instanceof Error ? err : new Error(String(err)));
    });

  return pass;
}

async function getVMStatsImpl(
  docker: Docker,
  vmId: string,
): Promise<VMStats | null> {
  try {
    const container = docker.getContainer(vmId);
    const stats = await container.stats({ stream: false }) as unknown as Record<string, unknown>;

    // Parse CPU
    const cpuStats = stats.cpu_stats as { cpu_usage?: { total_usage?: number }; system_cpu_usage?: number; online_cpus?: number } | undefined;
    const preCpuStats = stats.precpu_stats as { cpu_usage?: { total_usage?: number }; system_cpu_usage?: number } | undefined;

    let cpuPercent = 0;
    if (cpuStats && preCpuStats) {
      const cpuDelta =
        (cpuStats.cpu_usage?.total_usage ?? 0) -
        (preCpuStats.cpu_usage?.total_usage ?? 0);
      const systemDelta =
        (cpuStats.system_cpu_usage ?? 0) -
        (preCpuStats.system_cpu_usage ?? 0);
      const onlineCpus = cpuStats.online_cpus ?? 1;
      if (systemDelta > 0 && cpuDelta >= 0) {
        cpuPercent =
          Math.round((cpuDelta / systemDelta) * onlineCpus * 100 * 100) / 100;
      }
    }

    // Parse memory
    const memStats = stats.memory_stats as { usage?: number; limit?: number } | undefined;
    const memUsage = memStats?.usage ?? 0;
    const memLimit = memStats?.limit ?? 0;
    const memPercent =
      memLimit > 0
        ? Math.round((memUsage / memLimit) * 10000) / 100
        : 0;

    // Parse network
    const networks = stats.networks as Record<string, { rx_bytes?: number; tx_bytes?: number }> | undefined;
    let rxBytes = 0;
    let txBytes = 0;
    if (networks) {
      for (const net of Object.values(networks)) {
        rxBytes += net.rx_bytes ?? 0;
        txBytes += net.tx_bytes ?? 0;
      }
    }

    return {
      cpu: { percent: cpuPercent },
      memory: { usage: memUsage, limit: memLimit, percent: memPercent },
      network: { rxBytes, txBytes },
    };
  } catch (e) {
    log.debug("getVMStats failed", {
      vmId,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

async function getVMMetadataImpl(
  docker: Docker,
  vmId: string,
): Promise<{ vsockCID: number; ipAddress: string }> {
  const container = docker.getContainer(vmId);
  const ipAddress = await getContainerIP(container, AGENT_NETWORK);
  return { vsockCID: 0, ipAddress };
}

async function checkHealthImpl(docker: Docker): Promise<void> {
  await docker.ping();
}

async function getRunningVMCountImpl(
  docker: Docker,
): Promise<{ total: number; running: number; stopped: number }> {
  const all = await docker.listContainers({
    all: true,
    filters: piloxFilter(),
  });
  const running = all.filter((c) => c.State === "running").length;
  return { total: all.length, running, stopped: all.length - running };
}

async function listRunningVMsImpl(
  docker: Docker,
): Promise<Array<VMMetadata & { status: string }>> {
  const containers = await docker.listContainers({
    all: true,
    filters: piloxFilter(),
  });

  return containers.map((c) => {
    const labels = c.Labels ?? {};
    const nets = c.NetworkSettings?.Networks;
    let ipAddress = "0.0.0.0";
    if (nets) {
      const netEntry = nets[AGENT_NETWORK] ?? Object.values(nets)[0];
      if (netEntry?.IPAddress) {
        ipAddress = netEntry.IPAddress;
      }
    }

    return {
      vmId: labels[LABEL_VM_ID] || c.Names?.[0]?.replace(/^\//, "") || c.Id.slice(0, 12),
      name: labels[LABEL_AGENT_NAME] || c.Names?.[0]?.replace(/^\//, "") || "",
      image: c.Image,
      ipAddress,
      tapDevice: "",
      vsockCID: 0,
      createdAt: labels[LABEL_CREATED_AT] || new Date(c.Created * 1000).toISOString(),
      hypervisor: "docker" as const,
      status: c.State === "running"
        ? "running"
        : c.State === "paused"
          ? "paused"
          : "stopped",
    };
  });
}

async function cleanupOrphanedVMsImpl(
  docker: Docker,
): Promise<{ cleaned: string[]; errors: string[] }> {
  const cleaned: string[] = [];
  const errors: string[] = [];

  try {
    const containers = await docker.listContainers({
      all: true,
      filters: {
        ...piloxFilter(),
        status: ["exited", "dead"],
      },
    });

    for (const c of containers) {
      try {
        const container = docker.getContainer(c.Id);
        await container.remove({ force: true });
        cleaned.push(
          c.Labels?.[LABEL_VM_ID] || c.Id.slice(0, 12),
        );
      } catch (err) {
        errors.push(
          `${c.Id.slice(0, 12)}: ${err instanceof Error ? err.message : "unknown"}`,
        );
      }
    }
  } catch (e) {
    log.debug("cleanupOrphanedVMs list failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return { cleaned, errors };
}

// ── Factory ───────────────────────────────────────────────

export function createDockerBackend(): HypervisorBackend {
  const docker = dockerConnectionFromEnv();

  return {
    name: "docker",
    createVM: (opts) => createVM(docker, opts),
    startVM: (vmId) => startVMImpl(docker, vmId),
    stopVM: (vmId) => stopVMImpl(docker, vmId),
    pauseVM: (vmId) => pauseVMImpl(docker, vmId),
    resumeVM: (vmId) => resumeVMImpl(docker, vmId),
    destroyVM: (vmId) => destroyVMImpl(docker, vmId),
    getVMLogs: (vmId) => getVMLogsImpl(docker, vmId),
    getVMStats: (vmId) => getVMStatsImpl(docker, vmId),
    getVMMetadata: (vmId) => getVMMetadataImpl(docker, vmId),
    checkHealth: () => checkHealthImpl(docker),
    getRunningVMCount: () => getRunningVMCountImpl(docker),
    listRunningVMs: () => listRunningVMsImpl(docker),
    cleanupOrphanedVMs: () => cleanupOrphanedVMsImpl(docker),
  };
}
