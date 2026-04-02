// SPDX-License-Identifier: BUSL-1.1
// Pure logic — hardware + model → optimal config + performance estimate.
// No API/DB/React dependencies. Fully testable.

import type { HardwareProfile } from "./hardware-detect";

// ── Types ────────────────────────────────────────────

export interface InferenceConfig {
  backend: "ollama" | "vllm";
  model: string;
  quantization: "Q4_K_M" | "awq" | "gptq" | "fp16" | "vptq";
  turboQuant: boolean;
  speculativeDecoding: boolean;
  speculativeModel?: string;
  cpuOffloadGB: number;
  maxContextLen: number;
  prefixCaching: boolean;
  vptq: boolean;
}

export interface MemoryBreakdown {
  weightsGB: number;
  kvCacheGB: number;
  draftModelGB: number;
  totalGB: number;
}

export interface PerformanceEstimate {
  vramUsedMB: number;
  vramPercent: number;
  ramUsedMB: number;
  ramPercent: number;
  diskUsedGB: number;
  tokensPerSec: number;
  tokensPerSecSpeculative: number;
  firstTokenMs: number;
  maxContext: number;
  warnings: string[];
  recommendation?: string;
  fits: boolean;
  memory: MemoryBreakdown;
}

// ── Model size lookup (approximate, GB in FP16) ──────

const MODEL_SIZES_FP16: Record<string, number> = {
  "1b": 2, "1.5b": 3, "3b": 6, "6.7b": 13.4, "7b": 14, "8b": 16,
  "13b": 26, "14b": 28, "22b": 44, "32b": 64, "34b": 68,
  "70b": 140, "72b": 144, "110b": 220, "405b": 810,
};

// Approximate layer counts for KV cache estimation
const MODEL_LAYERS: Record<string, number> = {
  "1b": 16, "1.5b": 18, "3b": 26, "6.7b": 32, "7b": 32, "8b": 32,
  "13b": 40, "14b": 40, "22b": 48, "32b": 64, "34b": 48,
  "70b": 80, "72b": 80, "110b": 80, "405b": 126,
};

// Approximate hidden dimensions for KV cache estimation
const MODEL_HIDDEN_DIM: Record<string, number> = {
  "1b": 2048, "1.5b": 2048, "3b": 3072, "6.7b": 4096, "7b": 4096, "8b": 4096,
  "13b": 5120, "14b": 5120, "22b": 6144, "32b": 5120, "34b": 6656,
  "70b": 8192, "72b": 8192, "110b": 8192, "405b": 16384,
};

// Which quantization formats have checkpoints available per model size tier.
// VPTQ checkpoints only exist for 14B+ models. Small models (<8B) only have GGUF/FP16.
type QuantKey = "Q4_K_M" | "awq" | "gptq" | "fp16" | "vptq";
const QUANTS_BY_SIZE: { maxFP16GB: number; quants: QuantKey[] }[] = [
  { maxFP16GB: 6,   quants: ["Q4_K_M", "fp16"] },                          // 1B-3B
  { maxFP16GB: 16,  quants: ["Q4_K_M", "awq", "gptq", "fp16"] },          // 7B-8B
  { maxFP16GB: 28,  quants: ["Q4_K_M", "awq", "gptq", "vptq", "fp16"] }, // 13B-14B
  { maxFP16GB: Infinity, quants: ["awq", "gptq", "vptq", "fp16"] },       // 32B+
];

function availableQuants(fp16GB: number): QuantKey[] {
  for (const tier of QUANTS_BY_SIZE) {
    if (fp16GB <= tier.maxFP16GB) return tier.quants;
  }
  return ["awq", "fp16"];
}

function guessModelSizeGB(modelId: string): number {
  const lower = modelId.toLowerCase();
  for (const [key, size] of Object.entries(MODEL_SIZES_FP16)) {
    if (lower.includes(key) || lower.includes(key.replace("b", ""))) {
      return size;
    }
  }
  return 14; // default: assume 7B FP16
}

function guessModelLayers(modelId: string): number {
  const lower = modelId.toLowerCase();
  for (const [key, layers] of Object.entries(MODEL_LAYERS)) {
    if (lower.includes(key)) return layers;
  }
  return 32;
}

function guessHiddenDim(modelId: string): number {
  const lower = modelId.toLowerCase();
  for (const [key, dim] of Object.entries(MODEL_HIDDEN_DIM)) {
    if (lower.includes(key)) return dim;
  }
  return 4096;
}

export function quantFactor(quant: string): number {
  switch (quant) {
    case "fp16": return 1.0;
    case "Q4_K_M": return 0.28;  // 4-bit mixed precision
    case "awq": return 0.27;     // 4-bit activation-aware
    case "gptq": return 0.27;    // 4-bit post-training
    case "vptq": return 0.14;    // 2-bit vector quantization
    default: return 0.28;
  }
}

// ── KV cache estimation ─────────────────────────────
// Formula: numLayers * 2 (K+V) * hiddenDim * seqLen * bytesPerElement
// At FP16: bytesPerElement = 2, with TurboQuant 3-bit: bytesPerElement = 0.375

function estimateKvCacheGB(
  modelId: string,
  contextLen: number,
  turboQuant: boolean,
): number {
  const layers = guessModelLayers(modelId);
  const hiddenDim = guessHiddenDim(modelId);
  const bytesPerElement = turboQuant ? 0.375 : 2; // 3-bit vs FP16
  // 2 = key + value tensors
  const bytes = layers * 2 * hiddenDim * contextLen * bytesPerElement;
  return bytes / (1024 ** 3); // bytes → GB
}

// ── Smart optimizer ──────────────────────────────────

/**
 * Given hardware and a model ID, return the best inference config.
 */
export function optimizeInference(
  hw: HardwareProfile,
  modelId: string,
): InferenceConfig {
  const fp16GB = guessModelSizeGB(modelId);
  const vramGB = hw.gpu.vramMB / 1024;
  const availRamGB = Math.max(0, (hw.ram.availableMB / 1024) - 8);
  const hasGpu = hw.gpu.available && vramGB >= 2;

  // Small model (<8B FP16 = <16GB) → Ollama Q4 is simplest
  if (fp16GB <= 16) {
    const q4Size = fp16GB * quantFactor("Q4_K_M");
    return {
      backend: "ollama",
      model: modelId,
      quantization: "Q4_K_M",
      turboQuant: false,
      speculativeDecoding: false,
      cpuOffloadGB: Math.max(0, Math.ceil(q4Size - vramGB)),
      maxContextLen: 8192,
      prefixCaching: false,
      vptq: false,
    };
  }

  // Medium/Large model → vLLM AWQ if GPU available
  if (hasGpu) {
    const quants = availableQuants(fp16GB);
    // Try VPTQ 2-bit if model is too big for AWQ and VPTQ checkpoint exists
    const awqSize = fp16GB * quantFactor("awq");
    const vptqSize = fp16GB * quantFactor("vptq");
    const canVptq = quants.includes("vptq");
    const useVptq = canVptq && awqSize > vramGB && vptqSize <= vramGB + availRamGB;
    const effectiveQuant = useVptq ? "vptq" as const : "awq" as const;
    const effectiveFactor = quantFactor(effectiveQuant);
    const modelSizeGB = fp16GB * effectiveFactor;

    const fitsInVram = modelSizeGB <= vramGB;
    const offloadGB = fitsInVram ? 0 : Math.ceil(modelSizeGB - vramGB);
    const totalAvailable = vramGB + availRamGB;
    const fits = modelSizeGB <= totalAvailable;

    const canSpeculate = (vramGB - Math.min(modelSizeGB, vramGB)) >= 0.6 || offloadGB > 0;

    return {
      backend: "vllm",
      model: modelId,
      quantization: effectiveQuant,
      turboQuant: true,
      speculativeDecoding: canSpeculate && fp16GB > 16,
      speculativeModel: canSpeculate ? "Qwen/Qwen3-0.6B" : undefined,
      cpuOffloadGB: offloadGB,
      maxContextLen: fitsInVram ? 32768 : 8192,
      prefixCaching: true,
      vptq: useVptq,
    };
  }

  // No GPU → Ollama CPU only
  return {
    backend: "ollama",
    model: modelId,
    quantization: "Q4_K_M",
    turboQuant: false,
    speculativeDecoding: false,
    cpuOffloadGB: 0,
    maxContextLen: 4096,
    prefixCaching: false,
    vptq: false,
  };
}

// ── Performance estimator ────────────────────────────

/**
 * Estimate performance for a given hardware + config combination.
 */
export function estimatePerformance(
  hw: HardwareProfile,
  config: InferenceConfig,
): PerformanceEstimate {
  const fp16GB = guessModelSizeGB(config.model);
  // When VPTQ is enabled, use vptq factor regardless of selected quantization
  const effectiveQuant = config.vptq ? "vptq" : config.quantization;
  const factor = quantFactor(effectiveQuant);
  const hasGpu = hw.gpu.available;
  const vramGB = hw.gpu.vramMB / 1024;
  const totalRamGB = hw.ram.totalMB / 1024;

  // ── Memory breakdown ──────────────────────────────
  const weightsGB = fp16GB * factor;
  const kvCacheGB = estimateKvCacheGB(config.model, config.maxContextLen, config.turboQuant);
  const draftModelGB = config.speculativeDecoding ? 0.6 : 0;
  const totalGB = weightsGB + kvCacheGB + draftModelGB;

  // ── VRAM usage ────────────────────────────────────
  const vramForModel = Math.min(weightsGB, vramGB) * 1024; // MB
  const kvCacheMB = kvCacheGB * 1024;
  const draftModelMB = draftModelGB * 1024;
  const totalVramMB = Math.round(vramForModel + kvCacheMB + draftModelMB);

  // ── RAM usage (offload) ───────────────────────────
  const ramOffloadMB = Math.round(config.cpuOffloadGB * 1024);

  // ── Disk ──────────────────────────────────────────
  const diskGB = Math.round(weightsGB);

  // ── Speed estimation ──────────────────────────────
  let tokPerSec: number;
  if (!hasGpu) {
    tokPerSec = Math.max(1, Math.round(8 / (fp16GB / 14)));
  } else if (config.cpuOffloadGB > 0) {
    tokPerSec = Math.max(2, Math.round(15 / (fp16GB / 14)));
  } else {
    tokPerSec = Math.max(5, Math.round(35 / (fp16GB / 14)));
  }
  // VPTQ 2-bit has ~10% decode overhead vs AWQ due to vector codebook lookups
  if (config.vptq) {
    tokPerSec = Math.max(1, Math.round(tokPerSec * 0.9));
  }
  const tokPerSecSpec = config.speculativeDecoding
    ? Math.round(tokPerSec * 2.3)
    : tokPerSec;

  // ── First token latency ───────────────────────────
  const firstTokenMs = Math.round(1000 / tokPerSec * 3);

  // ── Warnings ──────────────────────────────────────
  const warnings: string[] = [];
  const fits = (weightsGB <= vramGB + (hw.ram.availableMB / 1024 - 8));

  if (config.cpuOffloadGB > 0) {
    warnings.push(`${config.cpuOffloadGB}GB offloaded to RAM — inference will be slower than full GPU.`);
  }
  if (totalVramMB > hw.gpu.vramMB && hasGpu) {
    warnings.push(`Model exceeds VRAM (${weightsGB.toFixed(1)}GB > ${vramGB.toFixed(1)}GB). CPU offload required.`);
  }
  if (!hasGpu) {
    warnings.push("No GPU detected — running on CPU only. Inference will be slow.");
  }
  if (!fits) {
    warnings.push("Model too large for available memory (VRAM + RAM). Consider a smaller model.");
  }
  if (config.vptq) {
    warnings.push("VPTQ 2-bit: slight quality reduction on complex reasoning. Chat/code quality is preserved.");
  }

  // ── Recommendation ────────────────────────────────
  let recommendation: string | undefined;
  if (config.cpuOffloadGB > 10 && fp16GB > 30 && !config.vptq) {
    recommendation = `Enable VPTQ 2-bit to reduce model size from ${weightsGB.toFixed(0)}GB to ${(fp16GB * quantFactor("vptq")).toFixed(0)}GB, or try a ${Math.round(vramGB / factor)}B model that fits entirely in GPU.`;
  } else if (config.cpuOffloadGB > 10 && fp16GB > 30) {
    recommendation = `For faster inference, consider a ${Math.round(vramGB / factor)}B model that fits entirely in your GPU.`;
  }

  return {
    vramUsedMB: Math.min(totalVramMB, hw.gpu.vramMB),
    vramPercent: hasGpu ? Math.min(100, Math.round((totalVramMB / hw.gpu.vramMB) * 100)) : 0,
    ramUsedMB: ramOffloadMB,
    ramPercent: Math.round((ramOffloadMB / (totalRamGB * 1024)) * 100),
    diskUsedGB: diskGB,
    tokensPerSec: tokPerSec,
    tokensPerSecSpeculative: tokPerSecSpec,
    firstTokenMs,
    maxContext: config.maxContextLen,
    warnings,
    recommendation,
    fits,
    memory: {
      weightsGB: Math.round(weightsGB * 10) / 10,
      kvCacheGB: Math.round(kvCacheGB * 10) / 10,
      draftModelGB: Math.round(draftModelGB * 10) / 10,
      totalGB: Math.round(totalGB * 10) / 10,
    },
  };
}
