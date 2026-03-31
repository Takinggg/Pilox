// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Agent Runtime — Multi-hypervisor dispatch layer.
 *
 * Selects the correct hypervisor backend based on agent requirements:
 *   - GPU or CoCo → Cloud Hypervisor (VFIO passthrough + TDX/SEV-SNP)
 *   - KVM available → Firecracker (fastest boot, ~125ms)
 *   - Fallback → Docker containers (~1-2s boot, universal)
 *
 * API routes import from this module only — never from individual backends.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import type { HypervisorBackend, HypervisorType, VMStats, VMMetadata } from "./hypervisor";
import { createFirecrackerBackend } from "./firecracker";
import { createCloudHypervisorBackend } from "./cloud-hypervisor";
import { createDockerBackend } from "./docker-runtime";
import { createModuleLogger } from "./logger";

export type { VMStats, HypervisorType };

const log = createModuleLogger("runtime");
const execFileAsync = promisify(execFile);

// ── All backend types for aggregation ─────────────────────

const ALL_BACKENDS: readonly HypervisorType[] = ["firecracker", "cloud-hypervisor", "docker"];

// ── Backend registry (lazy singletons) ────────────────────

const backends = new Map<HypervisorType, HypervisorBackend>();

function getBackend(type: HypervisorType): HypervisorBackend {
  let backend = backends.get(type);
  if (!backend) {
    switch (type) {
      case "firecracker":
        backend = createFirecrackerBackend();
        break;
      case "cloud-hypervisor":
        backend = createCloudHypervisorBackend();
        break;
      case "docker":
        backend = createDockerBackend();
        break;
      default:
        throw new Error(`Unknown hypervisor type: ${type}`);
    }
    backends.set(type, backend);
  }
  return backend;
}

// ── KVM detection (cached) ────────────────────────────────

let kvmAvailableCache: boolean | null = null;

function kvmAvailable(): boolean {
  if (kvmAvailableCache !== null) return kvmAvailableCache;
  try {
    kvmAvailableCache = existsSync("/dev/kvm");
  } catch (e) {
    log.debug("KVM probe failed", { error: e instanceof Error ? e.message : String(e) });
    kvmAvailableCache = false;
  }
  return kvmAvailableCache;
}

// ── Backend selection logic ───────────────────────────────

function selectBackend(opts: { gpuPassthrough?: boolean; confidential?: boolean }): HypervisorType {
  if (opts.gpuPassthrough || opts.confidential) {
    return "cloud-hypervisor";
  }
  if (kvmAvailable()) {
    return "firecracker";
  }
  return "docker";
}

// ── Resolve backend for existing VM ───────────────────────

const FC_BASE_DIR = process.env.FC_BASE_DIR || "/var/lib/pilox/firecracker";
const CH_BASE_DIR = process.env.CH_BASE_DIR || "/var/lib/pilox/cloud-hypervisor";

async function resolveBackendForVM(vmId: string): Promise<HypervisorBackend> {
  // Docker containers use "pilox-agent-" prefix
  if (vmId.startsWith("pilox-agent-")) {
    return getBackend("docker");
  }

  // Check both instance directories for metadata
  const candidates: Array<[string, HypervisorType]> = [
    [path.join(FC_BASE_DIR, "instances", vmId), "firecracker"],
    [path.join(CH_BASE_DIR, "instances", vmId), "cloud-hypervisor"],
  ];
  for (const [baseDir, type] of candidates) {
    try {
      const metaPath = path.join(baseDir, "metadata.json");
      const meta = JSON.parse(await readFile(metaPath, "utf-8"));
      if (
        meta.hypervisor === "firecracker" ||
        meta.hypervisor === "cloud-hypervisor"
      ) {
        return getBackend(meta.hypervisor);
      }
      return getBackend(type);
    } catch (e) {
      log.debug("VM metadata probe skipped", {
        dir: baseDir,
        error: e instanceof Error ? e.message : String(e),
      });
      continue;
    }
  }
  // Fallback: assume Docker if no KVM, otherwise Firecracker
  return getBackend(kvmAvailable() ? "firecracker" : "docker");
}

function resolveBackendForVMSync(vmId: string): HypervisorBackend {
  // Docker containers use "pilox-agent-" prefix
  if (vmId.startsWith("pilox-agent-")) {
    return getBackend("docker");
  }

  // Sync check for functions that return Readable (non-async)
  const chDir = path.join(CH_BASE_DIR, "instances", vmId);
  if (existsSync(chDir)) {
    return getBackend("cloud-hypervisor");
  }
  // Fallback: assume Docker if no KVM, otherwise Firecracker
  return getBackend(kvmAvailable() ? "firecracker" : "docker");
}

// ── Public API ────────────────────────────────────────────

export interface CreateInstanceOpts {
  name: string;
  image: string;
  envVars?: Record<string, string>;
  cpuLimit?: string;
  memoryLimit?: string;
  gpuEnabled?: boolean;
  gpuPassthrough?: boolean;
  gpuDevicePCI?: string;
  confidential?: boolean;
}

export interface InstanceResult {
  instanceId: string;
  ipAddress: string;
  hypervisor: HypervisorType;
}

export async function createInstance(
  opts: CreateInstanceOpts
): Promise<InstanceResult> {
  const hypervisorType = selectBackend(opts);
  const backend = getBackend(hypervisorType);
  const vm = await backend.createVM(opts);
  return {
    instanceId: vm.vmId,
    ipAddress: vm.ipAddress,
    hypervisor: hypervisorType,
  };
}

export async function startInstance(instanceId: string): Promise<void> {
  const backend = await resolveBackendForVM(instanceId);
  return backend.startVM(instanceId);
}

export async function stopInstance(instanceId: string): Promise<void> {
  const backend = await resolveBackendForVM(instanceId);
  return backend.stopVM(instanceId);
}

export async function pauseInstance(instanceId: string): Promise<void> {
  const backend = await resolveBackendForVM(instanceId);
  return backend.pauseVM(instanceId);
}

export async function resumeInstance(instanceId: string): Promise<void> {
  const backend = await resolveBackendForVM(instanceId);
  return backend.resumeVM(instanceId);
}

export async function destroyInstance(instanceId: string): Promise<void> {
  const backend = await resolveBackendForVM(instanceId);
  return backend.destroyVM(instanceId);
}

export function getInstanceLogs(instanceId: string): Readable {
  const backend = resolveBackendForVMSync(instanceId);
  return backend.getVMLogs(instanceId);
}

export async function getInstanceStats(instanceId: string): Promise<VMStats | null> {
  const backend = await resolveBackendForVM(instanceId);
  return backend.getVMStats(instanceId);
}

export async function getVMMetadata(instanceId: string): Promise<{ vsockCID: number; ipAddress: string }> {
  const backend = await resolveBackendForVM(instanceId);
  return backend.getVMMetadata(instanceId);
}

// ── System-level (aggregate across all backends) ──────────

export async function checkFirecrackerHealth(): Promise<void> {
  // Keep name for backward compat with health route
  await getBackend("firecracker").checkHealth();
}

export async function checkAllHypervisorHealth(): Promise<Record<HypervisorType, { healthy: boolean; error?: string }>> {
  const results: Record<string, { healthy: boolean; error?: string }> = {};
  for (const type of ALL_BACKENDS) {
    try {
      await getBackend(type).checkHealth();
      results[type] = { healthy: true };
    } catch (err) {
      results[type] = { healthy: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return results as Record<HypervisorType, { healthy: boolean; error?: string }>;
}

export async function getRunningVMCount(): Promise<{ total: number; running: number; stopped: number }> {
  let total = 0, running = 0, stopped = 0;
  for (const type of ALL_BACKENDS) {
    try {
      const counts = await getBackend(type).getRunningVMCount();
      total += counts.total;
      running += counts.running;
      stopped += counts.stopped;
    } catch (e) {
      log.debug("getRunningVMCount backend skipped", {
        backend: type,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { total, running, stopped };
}

export async function listRunningVMs(): Promise<Array<VMMetadata & { status: string }>> {
  const all: Array<VMMetadata & { status: string }> = [];
  for (const type of ALL_BACKENDS) {
    try {
      all.push(...(await getBackend(type).listRunningVMs()));
    } catch (e) {
      log.debug("listRunningVMs backend skipped", {
        backend: type,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return all;
}

export async function cleanupOrphanedVMs(): Promise<{ cleaned: string[]; errors: string[] }> {
  const cleaned: string[] = [];
  const errors: string[] = [];
  for (const type of ALL_BACKENDS) {
    try {
      const result = await getBackend(type).cleanupOrphanedVMs();
      cleaned.push(...result.cleaned);
      errors.push(...result.errors);
    } catch (e) {
      log.debug("cleanupOrphanedVMs backend skipped", {
        backend: type,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { cleaned, errors };
}

// ── GPU / Inference service detection (cached) ────────────

let gpuAvailableCache: boolean | null = null;
let gpuCacheTime = 0;
const GPU_CACHE_TTL_MS = 60_000;

export interface GPUInfo {
  available: boolean;
  gpus: Array<{ name: string; memory: string; index: number }>;
  driverVersion?: string;
  cudaVersion?: string;
  inferenceServiceRunning: boolean;
}

export async function checkGPUAvailable(): Promise<boolean> {
  if (gpuAvailableCache !== null && Date.now() - gpuCacheTime < GPU_CACHE_TTL_MS) {
    return gpuAvailableCache;
  }

  try {
    await execFileAsync("nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"], { timeout: 5_000 });
    gpuAvailableCache = true;
  } catch (e) {
    log.debug("nvidia-smi not available or failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    gpuAvailableCache = false;
  }

  gpuCacheTime = Date.now();
  return gpuAvailableCache;
}

export async function getGPUInfo(): Promise<GPUInfo> {
  const result: GPUInfo = {
    available: false,
    gpus: [],
    inferenceServiceRunning: false,
  };

  try {
    const { stdout } = await execFileAsync(
      "nvidia-smi",
      ["--query-gpu=index,name,memory.total,driver_version", "--format=csv,noheader,nounits"],
      { timeout: 5_000 }
    );

    for (const line of stdout.trim().split("\n")) {
      const parts = line.split(",").map((s) => s.trim());
      if (parts.length >= 4) {
        result.gpus.push({
          index: parseInt(parts[0]),
          name: parts[1],
          memory: `${parts[2]} MiB`,
        });
        result.driverVersion = parts[3];
      }
    }

    try {
      const { stdout: fullOut } = await execFileAsync("nvidia-smi", [], { timeout: 5_000 });
      const cudaMatch = fullOut.match(/CUDA Version:\s*([\d.]+)/);
      if (cudaMatch) result.cudaVersion = cudaMatch[1];
    } catch (e) {
      log.debug("nvidia-smi CUDA line parse skipped", {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    result.available = result.gpus.length > 0;
  } catch (e) {
    log.debug("getGPUInfo: nvidia-smi failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  try {
    await execFileAsync("systemctl", ["is-active", "--quiet", "pilox-inference"], { timeout: 3_000 });
    await execFileAsync("systemctl", ["is-active", "--quiet", "pilox-vsock-proxy"], { timeout: 3_000 });
    result.inferenceServiceRunning = true;
  } catch (e) {
    log.debug("pilox inference systemd services not active", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  gpuAvailableCache = result.available;
  gpuCacheTime = Date.now();

  return result;
}
