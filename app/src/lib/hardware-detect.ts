// SPDX-License-Identifier: BUSL-1.1
// Pure hardware detection — no API/DB/React dependencies. Fully testable.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import fs from "node:fs";

const execFileAsync = promisify(execFile);

export interface GpuInfo {
  name: string;
  vramMB: number;
  available: boolean;
}

export interface HardwareProfile {
  gpu: GpuInfo;
  ram: { totalMB: number; availableMB: number };
  cpu: { cores: number; model: string };
  disk: { freeGB: number; type: "ssd" | "hdd" | "unknown" };
}

/**
 * Detect GPU via nvidia-smi. Returns unavailable GPU if not found.
 */
async function detectGpu(): Promise<GpuInfo> {
  try {
    const { stdout } = await execFileAsync("nvidia-smi", [
      "--query-gpu=name,memory.total",
      "--format=csv,noheader,nounits",
    ], { timeout: 5_000 });

    const line = stdout.trim().split("\n")[0];
    if (!line) return { name: "None", vramMB: 0, available: false };

    const [name, vramStr] = line.split(",").map((s) => s.trim());
    return {
      name: name || "Unknown GPU",
      vramMB: parseInt(vramStr || "0", 10),
      available: true,
    };
  } catch {
    return { name: "None", vramMB: 0, available: false };
  }
}

/**
 * Detect RAM from OS.
 */
function detectRam(): { totalMB: number; availableMB: number } {
  const totalMB = Math.round(os.totalmem() / 1024 / 1024);
  const availableMB = Math.round(os.freemem() / 1024 / 1024);
  return { totalMB, availableMB };
}

/**
 * Detect CPU.
 */
function detectCpu(): { cores: number; model: string } {
  const cpus = os.cpus();
  return {
    cores: cpus.length,
    model: cpus[0]?.model?.trim() || "Unknown",
  };
}

/**
 * Detect disk free space on the data volume.
 */
function detectDisk(): { freeGB: number; type: "ssd" | "hdd" | "unknown" } {
  try {
    const stats = fs.statfsSync(process.cwd());
    const freeGB = Math.round((stats.bfree * stats.bsize) / 1024 / 1024 / 1024);
    return { freeGB, type: "unknown" }; // can't reliably detect SSD in Docker
  } catch {
    return { freeGB: 0, type: "unknown" };
  }
}

/**
 * Full hardware scan. Safe to call — never throws.
 */
export async function detectHardware(): Promise<HardwareProfile> {
  const [gpu, ram, cpu, disk] = await Promise.all([
    detectGpu(),
    Promise.resolve(detectRam()),
    Promise.resolve(detectCpu()),
    Promise.resolve(detectDisk()),
  ]);

  return { gpu, ram, cpu, disk };
}
