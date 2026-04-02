// SPDX-License-Identifier: BUSL-1.1
// Hardware detection — GPU via nvidia-smi OR Ollama fallback. Fully testable.

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

// ── GPU detection (nvidia-smi → Ollama fallback) ────

/**
 * Try nvidia-smi first (works on host / GPU-enabled containers).
 * If unavailable, query Ollama's API for GPU info (works in any container
 * that can reach Ollama over the network).
 */
async function detectGpu(): Promise<GpuInfo> {
  // Strategy 1: nvidia-smi (direct GPU access)
  const smiResult = await detectGpuViaNvidiaSmi();
  if (smiResult.available) return smiResult;

  // Strategy 2: Ollama API (GPU info from the inference container)
  const ollamaResult = await detectGpuViaOllama();
  if (ollamaResult.available) return ollamaResult;

  return { name: "None", vramMB: 0, available: false };
}

async function detectGpuViaNvidiaSmi(): Promise<GpuInfo> {
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
 * Query Ollama's /api/ps or /api/show to detect GPU info.
 * Ollama reports GPU layers and VRAM when a model is loaded.
 * Falls back to /api/tags to check if Ollama is reachable at all.
 */
async function detectGpuViaOllama(): Promise<GpuInfo> {
  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";

  try {
    // First try /api/ps — shows running models with GPU info
    const psResp = await fetch(`${ollamaUrl}/api/ps`, {
      signal: AbortSignal.timeout(5_000),
    });

    if (psResp.ok) {
      const ps = await psResp.json() as {
        models?: Array<{
          name: string;
          size_vram?: number;
          details?: { family?: string };
        }>;
      };

      if (ps.models && ps.models.length > 0) {
        const model = ps.models[0];
        const vramBytes = model.size_vram ?? 0;
        if (vramBytes > 0) {
          // Ollama reports VRAM used by this model — estimate total VRAM
          // by checking common GPU sizes
          const vramMB = Math.round(vramBytes / 1024 / 1024);
          const totalVramMB = estimateTotalVram(vramMB);
          return {
            name: `NVIDIA GPU (via Ollama, ${Math.round(totalVramMB / 1024)}GB VRAM)`,
            vramMB: totalVramMB,
            available: true,
          };
        }
      }
    }

    // If no models running, try to detect GPU via Ollama's system info
    // Ollama /api/show returns model info including GPU layers
    const tagsResp = await fetch(`${ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });

    if (tagsResp.ok) {
      const tags = await tagsResp.json() as {
        models?: Array<{ name: string }>;
      };

      if (tags.models && tags.models.length > 0) {
        // Try to show a model to get GPU info
        const showResp = await fetch(`${ollamaUrl}/api/show`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: tags.models[0].name }),
          signal: AbortSignal.timeout(5_000),
        });

        if (showResp.ok) {
          const show = await showResp.json() as {
            model_info?: Record<string, unknown>;
          };

          // Ollama doesn't directly expose GPU name, but if it responds
          // and has models, we know a GPU is likely available.
          // Use nvidia-smi via docker exec as last resort
          const gpuInfo = await detectGpuViaDockerExec();
          if (gpuInfo.available) return gpuInfo;
        }
      }
    }
  } catch {
    // Ollama not reachable — no GPU info available
  }

  return { name: "None", vramMB: 0, available: false };
}

/**
 * Try running nvidia-smi inside the ollama container via docker exec.
 * This works when pilox-app has access to the Docker socket.
 */
async function detectGpuViaDockerExec(): Promise<GpuInfo> {
  try {
    // Find the Ollama container
    const { stdout: psOut } = await execFileAsync("docker", [
      "ps", "--format", "{{.Names}}", "--filter", "ancestor=ollama/ollama",
    ], { timeout: 5_000 });

    let containerName = psOut.trim().split("\n")[0];
    if (!containerName) {
      // Try alternate filter
      const { stdout: psOut2 } = await execFileAsync("docker", [
        "ps", "--format", "{{.Names}}", "--filter", "name=ollama",
      ], { timeout: 5_000 });
      containerName = psOut2.trim().split("\n")[0];
    }

    if (!containerName) return { name: "None", vramMB: 0, available: false };

    // Run nvidia-smi inside the ollama container
    const { stdout } = await execFileAsync("docker", [
      "exec", containerName, "nvidia-smi",
      "--query-gpu=name,memory.total",
      "--format=csv,noheader,nounits",
    ], { timeout: 10_000 });

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
 * Estimate total VRAM from used VRAM.
 * If Ollama reports 7GB used, the GPU is likely 8GB or 10GB.
 */
function estimateTotalVram(usedMB: number): number {
  const knownSizes = [4096, 6144, 8192, 10240, 11264, 12288, 16384, 24576, 32768, 49152, 81920];
  for (const size of knownSizes) {
    if (usedMB <= size) return size;
  }
  return usedMB; // Larger than any known size
}

// ── RAM ─────────────────────────────────────────────

function detectRam(): { totalMB: number; availableMB: number } {
  const totalMB = Math.round(os.totalmem() / 1024 / 1024);
  const availableMB = Math.round(os.freemem() / 1024 / 1024);
  return { totalMB, availableMB };
}

// ── CPU ─────────────────────────────────────────────

function detectCpu(): { cores: number; model: string } {
  const cpus = os.cpus();
  return {
    cores: cpus.length,
    model: cpus[0]?.model?.trim() || "Unknown",
  };
}

// ── Disk ────────────────────────────────────────────

function detectDisk(): { freeGB: number; type: "ssd" | "hdd" | "unknown" } {
  try {
    const stats = fs.statfsSync(process.cwd());
    const freeGB = Math.round((stats.bfree * stats.bsize) / 1024 / 1024 / 1024);
    return { freeGB, type: "unknown" };
  } catch {
    return { freeGB: 0, type: "unknown" };
  }
}

// ── Public API ──────────────────────────────────────

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
