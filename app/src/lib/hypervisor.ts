/**
 * Hypervisor abstraction layer for Pilox agent isolation.
 *
 * All hypervisor backends (Firecracker, Cloud Hypervisor, etc.) implement
 * the HypervisorBackend interface. The runtime module selects the appropriate
 * backend based on agent requirements (GPU, CoCo, etc.).
 */

import { Readable } from "node:stream";

// ── Runtime tier ──────────────────────────────────────────

/**
 * Determines which hypervisor backend to use.
 *   - "firecracker": Lightweight non-GPU agents (~125ms boot)
 *   - "cloud-hypervisor": GPU passthrough + CoCo agents (~200ms boot)
 */
export type HypervisorType = "firecracker" | "cloud-hypervisor" | "docker";

// ── Shared types ──────────────────────────────────────────

export interface VMStats {
  cpu: { percent: number };
  memory: { usage: number; limit: number; percent: number };
  network: { rxBytes: number; txBytes: number };
}

export interface VMMetadata {
  vmId: string;
  name: string;
  image: string;
  ipAddress: string;
  tapDevice: string;
  vsockCID: number;
  createdAt: string;
  hypervisor: HypervisorType;
}

export interface CreateVMOpts {
  name: string;
  image: string;
  envVars?: Record<string, string>;
  cpuLimit?: string;
  memoryLimit?: string;
  /** Agent can access shared GPU inference service (vLLM/Ollama via vsock). No hypervisor change. */
  gpuEnabled?: boolean;
  /** Admin-only: assign a physical GPU to the VM via VFIO passthrough. Requires Cloud Hypervisor. */
  gpuPassthrough?: boolean;
  gpuDevicePCI?: string;
  confidential?: boolean;
}

export interface CreateVMResult {
  vmId: string;
  ipAddress: string;
  vsockCID: number;
}

// ── Backend interface ─────────────────────────────────────

export interface HypervisorBackend {
  readonly name: HypervisorType;

  createVM(opts: CreateVMOpts): Promise<CreateVMResult>;
  startVM(vmId: string): Promise<void>;
  stopVM(vmId: string): Promise<void>;
  pauseVM(vmId: string): Promise<void>;
  resumeVM(vmId: string): Promise<void>;
  destroyVM(vmId: string): Promise<void>;
  getVMLogs(vmId: string): Readable;
  getVMStats(vmId: string): Promise<VMStats | null>;
  getVMMetadata(vmId: string): Promise<{ vsockCID: number; ipAddress: string }>;
  checkHealth(): Promise<void>;
  getRunningVMCount(): Promise<{ total: number; running: number; stopped: number }>;
  listRunningVMs(): Promise<Array<VMMetadata & { status: string }>>;
  cleanupOrphanedVMs(): Promise<{ cleaned: string[]; errors: string[] }>;
}
