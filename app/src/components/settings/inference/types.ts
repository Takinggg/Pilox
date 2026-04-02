// SPDX-License-Identifier: BUSL-1.1
// Shared types & constants for the Inference Setup Wizard.
// No runtime dependencies — safe to import from anywhere.

// ── Hardware ────────────────────────────────────────

export interface GpuInfo {
  name: string;
  vramMB: number;
  available: boolean;
}

export interface HardwareProfile {
  gpu: GpuInfo;
  ram: { totalMB: number; availableMB: number };
  cpu: { cores: number; model: string };
  disk: { freeGB: number; type: string };
}

// ── Inference config ────────────────────────────────

export type Backend = "ollama" | "vllm" | "localai" | "airllm";
export type Quantization = "Q4_K_M" | "awq" | "gptq" | "fp16";

/** Which quantization formats each backend supports */
export const BACKEND_QUANTS: Record<Backend, Quantization[]> = {
  ollama: ["Q4_K_M", "fp16"],
  vllm: ["awq", "gptq", "fp16"],
  localai: ["Q4_K_M", "fp16"],
  airllm: ["fp16"],
};

export interface InferenceConfig {
  backend: string;
  model: string;
  quantization: string;
  turboQuant: boolean;
  speculativeDecoding: boolean;
  speculativeModel?: string;
  cpuOffloadGB: number;
  maxContextLen: number;
  prefixCaching: boolean;
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

// ── Wizard state ────────────────────────────────────

export type WizardMode = "auto" | "expert";
export type ExpertStep = "backends" | "model" | "optimizations";

export const EXPERT_STEPS: { key: ExpertStep; label: string; number: number }[] = [
  { key: "backends", label: "Backends", number: 1 },
  { key: "model", label: "Model", number: 2 },
  { key: "optimizations", label: "Optimizations", number: 3 },
];

// ── Backend catalog ─────────────────────────────────

export interface BackendOption {
  id: Backend;
  label: string;
  description: string;
  bestFor: string;
  recommended?: string;
  tier: "stable" | "experimental";
  tooltip: string;
}

export const BACKEND_CATALOG: BackendOption[] = [
  {
    id: "ollama",
    label: "Ollama",
    description: "Simplest setup, auto GPU/CPU split. Pull and run in seconds.",
    bestFor: "Chat, code, small models (<13B)",
    recommended: "recommended for <13B",
    tier: "stable",
    tooltip: "Ollama wraps llama.cpp with an easy-to-use CLI and API. Models are served in GGUF format with automatic GPU/CPU splitting. Ideal for quick local inference with minimal configuration.",
  },
  {
    id: "vllm",
    label: "vLLM",
    description: "Advanced: AWQ quantization, FP8 KV cache, prefix caching.",
    bestFor: "Big models, high throughput (>13B)",
    recommended: "recommended for >13B",
    tier: "stable",
    tooltip: "vLLM is a high-throughput serving engine using PagedAttention for efficient KV cache management. Supports continuous batching, tensor parallelism, AWQ/GPTQ quantization, and speculative decoding for maximum inference speed.",
  },
  {
    id: "localai",
    label: "LocalAI",
    description: "HuggingFace models, multi-modal support, classifiers.",
    bestFor: "BERT, Whisper, Stable Diffusion, TTS",
    tier: "stable",
    tooltip: "LocalAI provides OpenAI-compatible API for running HuggingFace models locally. Supports text, audio (Whisper), image generation (Stable Diffusion), embeddings (BERT), and text-to-speech — ideal for multi-modal pipelines.",
  },
  {
    id: "airllm",
    label: "AirLLM",
    description: "Layer-wise inference: 70B on 4GB VRAM. Very slow but works anywhere.",
    bestFor: "No GPU / tiny VRAM — last resort",
    tier: "experimental",
    tooltip: "AirLLM streams model layers one at a time through VRAM — only one layer is loaded at any moment. This allows running 70B+ models on hardware with as little as 4GB VRAM, but the bottleneck is disk I/O, resulting in ~1 token/s. Use as a last resort when no other option fits.",
  },
];

// ── Model catalog ───────────────────────────────────

export interface ModelOption {
  id: string;
  label: string;
  size: string;
  sizeGB: number;
  paramB: number;
  category: "chat" | "code" | "multimodal";
  defaultBackend: Backend;
  defaultQuant: Quantization;
  availableQuants: Quantization[];
}

export const MODEL_CATALOG: ModelOption[] = [
  { id: "llama-3.2-1b", label: "Llama 3.2 1B", size: "1B", sizeGB: 0.6, paramB: 1, category: "chat", defaultBackend: "ollama", defaultQuant: "Q4_K_M", availableQuants: ["Q4_K_M", "fp16"] },
  { id: "llama-3.2-3b", label: "Llama 3.2 3B", size: "3B", sizeGB: 1.7, paramB: 3, category: "chat", defaultBackend: "ollama", defaultQuant: "Q4_K_M", availableQuants: ["Q4_K_M", "fp16"] },
  { id: "llama-3.1-8b", label: "Llama 3.1 8B", size: "8B", sizeGB: 4.5, paramB: 8, category: "chat", defaultBackend: "ollama", defaultQuant: "Q4_K_M", availableQuants: ["Q4_K_M", "awq", "gptq", "fp16"] },
  { id: "deepseek-coder-6.7b", label: "DeepSeek Coder 6.7B", size: "6.7B", sizeGB: 3.8, paramB: 6.7, category: "code", defaultBackend: "ollama", defaultQuant: "Q4_K_M", availableQuants: ["Q4_K_M", "fp16"] },
  { id: "qwen-2.5-14b", label: "Qwen 2.5 14B", size: "14B", sizeGB: 8, paramB: 14, category: "chat", defaultBackend: "vllm", defaultQuant: "awq", availableQuants: ["Q4_K_M", "awq", "gptq", "fp16"] },
  { id: "qwen-2.5-32b", label: "Qwen 2.5 32B", size: "32B", sizeGB: 18, paramB: 32, category: "chat", defaultBackend: "vllm", defaultQuant: "awq", availableQuants: ["awq", "gptq", "fp16"] },
  { id: "codellama-34b", label: "Code Llama 34B", size: "34B", sizeGB: 19, paramB: 34, category: "code", defaultBackend: "vllm", defaultQuant: "awq", availableQuants: ["awq", "gptq", "fp16"] },
  { id: "llama-3.3-70b", label: "Llama 3.3 70B", size: "70B", sizeGB: 35, paramB: 70, category: "chat", defaultBackend: "vllm", defaultQuant: "awq", availableQuants: ["awq", "gptq", "fp16"] },
  { id: "qwen-2.5-72b", label: "Qwen 2.5 72B", size: "72B", sizeGB: 36, paramB: 72, category: "chat", defaultBackend: "vllm", defaultQuant: "awq", availableQuants: ["awq", "gptq", "fp16"] },
];

// ── Optimization definitions ────────────────────────

export interface OptimizationDef {
  id: "turboQuant" | "speculativeDecoding" | "prefixCaching";
  label: string;
  description: string;
  impact: string;
  cost?: string;
  tooltip: string;
  requiresVllm: boolean;
  tier?: "stable" | "coming_soon";
}

export const OPTIMIZATION_CATALOG: OptimizationDef[] = [
  {
    id: "turboQuant",
    label: "FP8 KV Cache",
    description: "Compresses the key-value cache from 16-bit to 8-bit FP8 during inference.",
    impact: "Reduces KV cache memory by 2x",
    tooltip: "During autoregressive decoding, the KV cache stores past key/value tensors for attention. FP8 KV cache quantizes these from FP16 to FP8 with negligible quality loss, reducing KV cache memory by 2x. This is separate from weight quantization — it compresses the runtime cache, not the stored model.",
    requiresVllm: true,
  },
  {
    id: "speculativeDecoding",
    label: "Speculative Decoding",
    description: "A small draft model proposes candidate tokens, the main model verifies them in a single forward pass.",
    impact: "2-3x faster generation",
    cost: "+0.6GB VRAM for draft model (Qwen3-0.6B)",
    tooltip: "Instead of generating one token at a time (each requiring a full forward pass of the 70B model), a small 0.6B draft model proposes 5 candidate tokens in ~5ms. The large model then verifies all 5 in one parallel pass (~100ms), accepting 3-4 on average. Net result: same quality, 2-3x higher throughput. The draft model adds ~0.6GB VRAM overhead.",
    requiresVllm: true,
    tier: "coming_soon",
  },
  {
    id: "prefixCaching",
    label: "Prefix Caching",
    description: "Caches common prompt prefixes across requests to avoid recomputation.",
    impact: "2x faster for repeated system prompts",
    tooltip: "When multiple requests share the same system prompt (e.g., agent instructions), the KV cache for that prefix is computed once and reused across all subsequent requests. This eliminates redundant computation for the shared prefix, cutting time-to-first-token roughly in half for agents with long system prompts. Only applies to the vLLM backend with prefix caching enabled.",
    requiresVllm: true,
  },
];

// ── Quantization definitions ────────────────────────

export interface QuantOption {
  value: Quantization;
  label: string;
  bits: number;
  tooltip: string;
}

export const QUANT_OPTIONS: QuantOption[] = [
  { value: "fp16", label: "FP16 (uncompressed)", bits: 16, tooltip: "Full 16-bit floating point. Maximum quality, maximum memory. A 70B model needs ~140GB. Only practical for datacenter GPUs (A100/H100)." },
  { value: "Q4_K_M", label: "Q4_K_M (Ollama)", bits: 4, tooltip: "GGUF 4-bit quantization optimized for llama.cpp/Ollama. Good balance of quality and speed. Uses mixed-precision: important layers keep higher precision." },
  { value: "awq", label: "AWQ 4-bit (vLLM)", bits: 4, tooltip: "Activation-aware Weight Quantization. Identifies the 1% of weights most critical to output quality and preserves them at higher precision. Slightly better quality than GPTQ at the same bit-width." },
  { value: "gptq", label: "GPTQ 4-bit (vLLM)", bits: 4, tooltip: "Post-training quantization using Hessian-based error correction. Very fast inference on GPU. Comparable quality to AWQ. Some models only have GPTQ checkpoints available." },
];

// ── Helpers ─────────────────────────────────────────

export function mbToGB(mb: number, decimals = 1): string {
  return (mb / 1024).toFixed(decimals);
}

export function categoryBadgeColor(cat: ModelOption["category"]): string {
  switch (cat) {
    case "chat": return "bg-primary/15 text-primary";
    case "code": return "bg-pilox-blue/20 text-pilox-blue";
    case "multimodal": return "bg-pilox-purple/20 text-pilox-purple";
  }
}

export function quantBitsLabel(quant: Quantization): string {
  const def = QUANT_OPTIONS.find((q) => q.value === quant);
  return def ? `${def.bits}-bit` : quant;
}
