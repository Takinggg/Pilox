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

// ── GPU detection (NVIDIA → AMD → Intel → Apple → Docker → Ollama) ────

/**
 * Detect GPU across all vendors. Tries local CLI tools first, then
 * falls back to docker exec and Ollama API.
 */
async function detectGpu(): Promise<GpuInfo> {
  // Strategy 1: NVIDIA — nvidia-smi (host or GPU-enabled container)
  const nvidia = await detectGpuViaNvidiaSmi();
  if (nvidia.available) return nvidia;

  // Strategy 2: AMD — rocm-smi (ROCm-enabled host)
  const amd = await detectGpuViaRocmSmi();
  if (amd.available) return amd;

  // Strategy 3: Intel — xpu-smi or clinfo (Arc / Data Center GPUs)
  const intel = await detectGpuViaIntel();
  if (intel.available) return intel;

  // Strategy 4: Apple Silicon — system_profiler (macOS Metal)
  const apple = await detectGpuViaAppleSilicon();
  if (apple.available) return apple;

  // Strategy 5: nvidia-smi via dockerode exec in Ollama container
  const dockerResult = await detectGpuViaDockerExec();
  if (dockerResult.available) return dockerResult;

  // Strategy 6: Ollama API (estimated VRAM from loaded model — least accurate)
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

// ── AMD GPU detection via rocm-smi ─────────────────

/**
 * Detect AMD GPU via rocm-smi (ROCm). Works on Linux hosts with AMD GPUs.
 * Output format: CSV with "card0, gfx1100, 0x744c, 16368, ..."
 */
async function detectGpuViaRocmSmi(): Promise<GpuInfo> {
  try {
    const { stdout } = await execFileAsync("rocm-smi", [
      "--showproductname", "--showmeminfo", "vram",
      "--csv",
    ], { timeout: 5_000 });

    // Parse product name from rocm-smi output
    const lines = stdout.trim().split("\n");

    // Try to find GPU name from --showproductname
    let gpuName = "AMD GPU";
    const nameMatch = stdout.match(/Card Series:\s*(.+)/i) || stdout.match(/Marketing Name:\s*(.+)/i);
    if (nameMatch) gpuName = nameMatch[1].trim();

    // Try to find total VRAM from --showmeminfo vram
    let vramMB = 0;
    const vramMatch = stdout.match(/Total Memory \(B\):\s*(\d+)/i);
    if (vramMatch) {
      vramMB = Math.round(parseInt(vramMatch[1], 10) / 1024 / 1024);
    } else {
      // Fallback: look for VRAM in MB directly
      const mbMatch = stdout.match(/(\d{3,6})\s*MB/i);
      if (mbMatch) vramMB = parseInt(mbMatch[1], 10);
    }

    if (vramMB > 0) {
      return { name: gpuName, vramMB, available: true };
    }

    // Last resort: try rocminfo
    return detectGpuViaRocmInfo();
  } catch {
    return detectGpuViaRocmInfo();
  }
}

async function detectGpuViaRocmInfo(): Promise<GpuInfo> {
  try {
    const { stdout } = await execFileAsync("rocminfo", [], { timeout: 5_000 });

    const nameMatch = stdout.match(/Marketing Name:\s*(.+)/i)
      || stdout.match(/Name:\s*(gfx\w+)/i);
    const poolMatch = stdout.match(/Pool.*Size.*?:\s*(\d+)\s*\(.*?KB\)/i)
      || stdout.match(/Size:\s*(\d+)\s*KB.*?VRAM/i);

    if (nameMatch) {
      let vramMB = 0;
      if (poolMatch) {
        vramMB = Math.round(parseInt(poolMatch[1], 10) / 1024);
      }
      return {
        name: nameMatch[1].trim(),
        vramMB: vramMB || estimateAmdVram(nameMatch[1].trim()),
        available: true,
      };
    }
  } catch { /* rocminfo not available */ }
  return { name: "None", vramMB: 0, available: false };
}

/** Estimate VRAM for known AMD GPUs when detection fails */
function estimateAmdVram(name: string): number {
  const n = name.toLowerCase();
  if (n.includes("7900 xtx")) return 24576;
  if (n.includes("7900 xt")) return 20480;
  if (n.includes("7900 gre")) return 16384;
  if (n.includes("7800 xt")) return 16384;
  if (n.includes("7700 xt")) return 12288;
  if (n.includes("7600")) return 8192;
  if (n.includes("6950 xt")) return 16384;
  if (n.includes("6900")) return 16384;
  if (n.includes("6800")) return 16384;
  if (n.includes("6700 xt")) return 12288;
  if (n.includes("6600")) return 8192;
  if (n.includes("mi300")) return 192 * 1024;
  if (n.includes("mi250")) return 128 * 1024;
  if (n.includes("mi210")) return 65536;
  if (n.includes("mi100")) return 32768;
  return 8192; // safe default for unknown AMD GPU
}

// ── Intel GPU detection via xpu-smi / clinfo ───────

/**
 * Detect Intel GPU (Arc, Data Center, integrated). Tries xpu-smi first (Intel
 * discrete GPUs), then clinfo (OpenCL, covers integrated Intel too).
 */
async function detectGpuViaIntel(): Promise<GpuInfo> {
  // Try xpu-smi (Intel discrete GPUs: Arc A770, A750, Flex, Max)
  try {
    const { stdout } = await execFileAsync("xpu-smi", ["discovery"], { timeout: 5_000 });
    const nameMatch = stdout.match(/Device Name:\s*(.+)/i);
    const memMatch = stdout.match(/Memory Physical Size:\s*([\d.]+)\s*(MiB|GiB|MB|GB)/i);

    if (nameMatch && memMatch) {
      let vramMB = parseFloat(memMatch[1]);
      if (memMatch[2].toLowerCase().startsWith("g")) vramMB *= 1024;
      return {
        name: nameMatch[1].trim(),
        vramMB: Math.round(vramMB),
        available: true,
      };
    }
  } catch { /* xpu-smi not available */ }

  // Fallback: clinfo (OpenCL) — works on Linux/Windows for Intel iGPU/dGPU
  try {
    const { stdout } = await execFileAsync("clinfo", [], { timeout: 5_000 });
    // Find Intel device
    const sections = stdout.split(/Device Name/i);
    for (const section of sections) {
      if (!section.toLowerCase().includes("intel")) continue;
      const nameMatch = section.match(/^\s*(.+)/);
      const memMatch = section.match(/Global Memory Size:\s*(\d+)/i);
      if (nameMatch && memMatch) {
        const vramBytes = parseInt(memMatch[1], 10);
        return {
          name: `Intel ${nameMatch[1].trim()}`,
          vramMB: Math.round(vramBytes / 1024 / 1024),
          available: true,
        };
      }
    }
  } catch { /* clinfo not available */ }

  return { name: "None", vramMB: 0, available: false };
}

// ── Apple Silicon detection via system_profiler ────

/**
 * Detect Apple Silicon GPU (M1/M2/M3/M4). On macOS, the GPU shares
 * unified memory — we report total RAM as "VRAM" since Metal can use it all.
 */
async function detectGpuViaAppleSilicon(): Promise<GpuInfo> {
  if (process.platform !== "darwin") {
    return { name: "None", vramMB: 0, available: false };
  }

  try {
    const { stdout } = await execFileAsync("system_profiler", [
      "SPDisplaysDataType", "-json",
    ], { timeout: 5_000 });

    const data = JSON.parse(stdout) as {
      SPDisplaysDataType?: Array<{
        sppci_model?: string;
        _name?: string;
        spdisplays_vram_shared?: string;
        spdisplays_vram?: string;
      }>;
    };

    const gpu = data.SPDisplaysDataType?.[0];
    if (!gpu) return { name: "None", vramMB: 0, available: false };

    const name = gpu.sppci_model || gpu._name || "Apple GPU";

    // Apple Silicon uses unified memory — VRAM = shared system RAM
    const vramStr = gpu.spdisplays_vram_shared || gpu.spdisplays_vram || "";
    const vramMatch = vramStr.match(/([\d.]+)\s*(GB|MB)/i);
    let vramMB = 0;
    if (vramMatch) {
      vramMB = parseFloat(vramMatch[1]);
      if (vramMatch[2].toUpperCase() === "GB") vramMB *= 1024;
    }

    // Fallback: use total system RAM (unified memory)
    if (vramMB === 0) {
      vramMB = Math.round(os.totalmem() / 1024 / 1024);
    }

    return { name, vramMB, available: true };
  } catch {
    // Fallback: detect via sysctl on macOS
    try {
      const { stdout } = await execFileAsync("sysctl", ["-n", "machdep.cpu.brand_string"], { timeout: 3_000 });
      if (stdout.toLowerCase().includes("apple")) {
        const totalMB = Math.round(os.totalmem() / 1024 / 1024);
        return {
          name: `Apple ${stdout.trim()} GPU`,
          vramMB: totalMB, // unified memory
          available: true,
        };
      }
    } catch { /* not macOS or sysctl failed */ }
  }

  return { name: "None", vramMB: 0, available: false };
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
 * Detect GPU via dockerode — exec nvidia-smi inside the Ollama container.
 * Works when pilox-app has the Docker socket mounted (no docker CLI needed).
 */
async function detectGpuViaDockerExec(): Promise<GpuInfo> {
  try {
    const docker = (await import("./docker")).default;

    // Find the Ollama container
    const containers = await docker.listContainers({ all: false });
    const ollamaContainer = containers.find(
      (c: { Names: string[]; Image: string }) =>
        c.Names.some((n: string) => n.includes("ollama")) ||
        c.Image.includes("ollama"),
    );

    if (!ollamaContainer) return { name: "None", vramMB: 0, available: false };

    const container = docker.getContainer(ollamaContainer.Id);

    // Exec nvidia-smi inside the Ollama container via dockerode.
    // Use Tty: true so Docker sends raw output without multiplexed frame
    // headers that corrupt comma-split parsing.
    const exec = await container.exec({
      Cmd: ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
      AttachStdout: true,
      AttachStderr: false,
      Tty: true,
    });

    const stream = await exec.start({ Detach: false, Tty: true });

    // Collect stdout (no demuxing needed with Tty: true)
    const output = await new Promise<string>((resolve, reject) => {
      let data = "";
      const timeout = setTimeout(() => resolve(data), 10_000);
      stream.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      stream.on("end", () => { clearTimeout(timeout); resolve(data); });
      stream.on("error", (e: Error) => { clearTimeout(timeout); reject(e); });
    });

    // Parse CSV output: "NVIDIA GeForce RTX 3080, 10240"
    // Strip any ANSI escape sequences and control chars (TTY may add carriage returns)
    const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, "").replace(/[\x00-\x09\x0b-\x1F\x7F]/g, "").trim();
    const line = cleanOutput.split("\n")[0]?.trim() ?? "";

    // Split by comma — nvidia-smi CSV format is "name, memory_total_mb"
    const parts = line.split(",").map((s) => s.trim());
    if (parts.length >= 2) {
      const name = parts[0];
      const vramMB = parseInt(parts[1], 10);
      if (name && vramMB > 0) {
        return { name, vramMB, available: true };
      }
    }

    // Fallback: extract VRAM with regex (handles unexpected formats)
    const nameMatch = line.match(/(NVIDIA[^,\n]+|GeForce[^,\n]+)/);
    const vramMatch = line.match(/(\d{4,6})\s*$/); // VRAM at end of line
    if (nameMatch && vramMatch) {
      return {
        name: nameMatch[1].trim(),
        vramMB: parseInt(vramMatch[1], 10),
        available: true,
      };
    }

    return { name: "None", vramMB: 0, available: false };
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
