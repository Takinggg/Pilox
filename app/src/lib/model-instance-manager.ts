// SPDX-License-Identifier: BUSL-1.1
/**
 * Model Instance Manager — Creates/manages isolated inference instances per model.
 *
 * Each model gets its own VM/container with specific optimization settings:
 *   - GPU models (>13B, vLLM) → Cloud Hypervisor (GPU passthrough) or Docker (fallback)
 *   - CPU models (<13B, Ollama) → Firecracker microVM or Docker (fallback)
 *
 * The manager:
 *   1. Saves instance config to DB (model_instances table)
 *   2. Creates the VM/container via the runtime layer
 *   3. Starts the inference engine (Ollama or vLLM) with the right settings
 *   4. Tracks instance health and provides routing info
 */

import { db } from "@/db";
import { modelInstances } from "@/db/schema";
import { eq } from "drizzle-orm";
import docker from "./docker";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("model-instance-manager");

// ── Pull progress (in-memory, consumed by SSE endpoint) ──

export interface PullProgress {
  completed: number;
  total: number;
  status: string;
}

/** Live pull progress per instance ID. Entries removed on completion/error. */
export const pullProgressMap = new Map<string, PullProgress>();

// ── Types ───────────────────────────────────────────

export interface ModelInstanceConfig {
  modelName: string;
  displayName: string;
  backend: "ollama" | "vllm";
  quantization: string;
  turboQuant: boolean;
  speculativeDecoding: boolean;
  speculativeModel?: string;
  cpuOffloadGB: number;
  maxContextLen: number;
  prefixCaching: boolean;
  vptq: boolean;
  gpuEnabled: boolean;
  parameterSize?: string;
  family?: string;
  createdBy?: string;
}

export interface ModelInstance {
  id: string;
  modelName: string;
  displayName: string;
  backend: string;
  status: string;
  instanceId: string | null;
  instanceIp: string | null;
  port: number;
  quantization: string;
  turboQuant: boolean;
  speculativeDecoding: boolean;
  cpuOffloadGB: number;
  maxContextLen: number;
  prefixCaching: boolean;
  vptq: boolean;
  gpuEnabled: boolean;
  error: string | null;
}

// ── Docker networking ───────────────────────────────

const PILOX_NETWORK = "pilox-network";
const OLLAMA_IMAGE = process.env.OLLAMA_IMAGE || "ollama/ollama:latest";
const VLLM_IMAGE = process.env.VLLM_IMAGE || "vllm/vllm-openai:latest";

// ── Create instance ─────────────────────────────────

/**
 * Create a new inference instance for a model.
 * Saves config to DB, creates a Docker container, starts the engine.
 */
export async function createModelInstance(config: ModelInstanceConfig): Promise<ModelInstance> {
  log.info("Creating model instance", { model: config.modelName, backend: config.backend });

  // Check if instance already exists for this model
  const existing = await db.select().from(modelInstances)
    .where(eq(modelInstances.modelName, config.modelName))
    .limit(1);

  if (existing.length > 0 && existing[0].status !== "error" && existing[0].status !== "stopped") {
    log.info("Instance already exists, updating config", { id: existing[0].id });
    return updateModelInstance(existing[0].id, config);
  }

  // Insert into DB
  const [row] = await db.insert(modelInstances).values({
    modelName: config.modelName,
    displayName: config.displayName,
    backend: config.backend,
    quantization: config.quantization,
    turboQuant: config.turboQuant,
    speculativeDecoding: config.speculativeDecoding,
    speculativeModel: config.speculativeModel,
    cpuOffloadGB: config.cpuOffloadGB,
    maxContextLen: config.maxContextLen,
    prefixCaching: config.prefixCaching,
    vptq: config.vptq,
    gpuEnabled: config.gpuEnabled,
    parameterSize: config.parameterSize,
    family: config.family,
    createdBy: config.createdBy,
    status: "creating",
  }).returning();

  try {
    // Create the container
    const containerInfo = config.backend === "vllm"
      ? await createVllmContainer(row.id, config)
      : await createOllamaContainer(row.id, config);

    // Update DB with container info
    await db.update(modelInstances)
      .set({
        instanceId: containerInfo.containerId,
        instanceIp: containerInfo.ip,
        port: containerInfo.port,
        status: "pulling",
        updatedAt: new Date(),
      })
      .where(eq(modelInstances.id, row.id));

    log.info("Model instance created", {
      id: row.id,
      model: config.modelName,
      containerId: containerInfo.containerId,
    });

    return {
      id: row.id,
      modelName: config.modelName,
      displayName: config.displayName,
      backend: config.backend,
      status: "pulling",
      instanceId: containerInfo.containerId,
      instanceIp: containerInfo.ip,
      port: containerInfo.port,
      quantization: config.quantization,
      turboQuant: config.turboQuant,
      speculativeDecoding: config.speculativeDecoding,
      cpuOffloadGB: config.cpuOffloadGB,
      maxContextLen: config.maxContextLen,
      prefixCaching: config.prefixCaching,
      vptq: config.vptq,
      gpuEnabled: config.gpuEnabled,
      error: null,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await db.update(modelInstances)
      .set({ status: "error", error: errorMsg, updatedAt: new Date() })
      .where(eq(modelInstances.id, row.id));

    log.error("Failed to create model instance", { id: row.id, error: errorMsg });
    throw err;
  }
}

// ── Ollama → HuggingFace model name mapping for vLLM ──

/**
 * Model registry — maps Ollama names to HuggingFace checkpoints per quantization.
 * vLLM can't quantize on-the-fly; it needs pre-quantized checkpoints.
 * "fp16" = base model (BF16/FP16 weights).
 */
interface HfCheckpoints {
  fp16: string;
  awq?: string;
  gptq?: string;
  vptq?: string;
}

const MODEL_REGISTRY: Record<string, HfCheckpoints> = {
  "deepseek-r1:70b": {
    fp16: "deepseek-ai/DeepSeek-R1-Distill-Llama-70B",
    awq: "hugging-quants/DeepSeek-R1-Distill-Llama-70B-AWQ-INT4",
    gptq: "ModelCloud/DeepSeek-R1-Distill-Llama-70B-gptq-4bit",
    vptq: "VPTQ-community/DeepSeek-R1-Distill-Llama-70B-v8-k65536-65536-woft",
  },
  "deepseek-r1:32b": {
    fp16: "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B",
    awq: "hugging-quants/DeepSeek-R1-Distill-Qwen-32B-AWQ-INT4",
    gptq: "ModelCloud/DeepSeek-R1-Distill-Qwen-32B-gptq-4bit",
    vptq: "VPTQ-community/DeepSeek-R1-Distill-Qwen-32B-v8-k65536-65536-woft",
  },
  "deepseek-r1:14b": {
    fp16: "deepseek-ai/DeepSeek-R1-Distill-Qwen-14B",
    awq: "hugging-quants/DeepSeek-R1-Distill-Qwen-14B-AWQ-INT4",
    gptq: "ModelCloud/DeepSeek-R1-Distill-Qwen-14B-gptq-4bit",
    vptq: "VPTQ-community/DeepSeek-R1-Distill-Qwen-14B-v8-k65536-65536-woft",
  },
  "deepseek-r1:7b": {
    fp16: "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
    awq: "hugging-quants/DeepSeek-R1-Distill-Qwen-7B-AWQ-INT4",
  },
  "deepseek-r1:8b-llama": {
    fp16: "deepseek-ai/DeepSeek-R1-Distill-Llama-8B",
    awq: "hugging-quants/DeepSeek-R1-Distill-Llama-8B-AWQ-INT4",
  },
  "deepseek-r1:671b": {
    fp16: "deepseek-ai/DeepSeek-R1",
  },
  "llama3.3": {
    fp16: "meta-llama/Llama-3.3-70B-Instruct",
    awq: "hugging-quants/Meta-Llama-3.3-70B-Instruct-AWQ-INT4",
    gptq: "hugging-quants/Meta-Llama-3.3-70B-Instruct-GPTQ-INT4",
  },
  "llama3.1:8b": {
    fp16: "meta-llama/Llama-3.1-8B-Instruct",
    awq: "hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4",
  },
  "llama3.1:70b": {
    fp16: "meta-llama/Llama-3.1-70B-Instruct",
    awq: "hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4",
    gptq: "hugging-quants/Meta-Llama-3.1-70B-Instruct-GPTQ-INT4",
  },
  "llama3.1:405b": { fp16: "meta-llama/Llama-3.1-405B-Instruct" },
  "llama3.2:3b": { fp16: "meta-llama/Llama-3.2-3B-Instruct" },
  "llama3.2:1b": { fp16: "meta-llama/Llama-3.2-1B-Instruct" },
  "qwen3:8b": { fp16: "Qwen/Qwen3-8B" },
  "qwen3:4b": { fp16: "Qwen/Qwen3-4B" },
  "qwen3:32b": { fp16: "Qwen/Qwen3-32B" },
  "mistral:7b": {
    fp16: "mistralai/Mistral-7B-Instruct-v0.3",
    awq: "TheBloke/Mistral-7B-Instruct-v0.2-AWQ",
  },
  "mixtral:8x7b": {
    fp16: "mistralai/Mixtral-8x7B-Instruct-v0.1",
    awq: "TheBloke/Mixtral-8x7B-Instruct-v0.1-AWQ",
  },
  "gemma2:9b": { fp16: "google/gemma-2-9b-it" },
  "gemma2:27b": { fp16: "google/gemma-2-27b-it" },
  "phi3:14b": { fp16: "microsoft/Phi-3-medium-128k-instruct" },
  "codellama:34b": { fp16: "codellama/CodeLlama-34b-Instruct-hf" },
  "codellama:7b": { fp16: "codellama/CodeLlama-7b-Instruct-hf" },
};

/**
 * Resolve model name + quantization to the correct HuggingFace checkpoint.
 * vLLM needs pre-quantized checkpoints — it can't quantize on-the-fly.
 */
function resolveVllmModelName(modelName: string, quantization?: string): string {
  // Already a HF ID (contains /) — use as-is
  if (modelName.includes("/")) return modelName;

  const entry = MODEL_REGISTRY[modelName] || MODEL_REGISTRY[modelName.toLowerCase()];
  if (!entry) {
    // Strip Ollama tag suffix and try again
    const base = modelName.split(":")[0];
    const baseEntry = MODEL_REGISTRY[base];
    if (baseEntry) return pickCheckpoint(baseEntry, quantization, modelName);
    log.warn("No HuggingFace checkpoint mapping for model", { modelName, quantization });
    return modelName;
  }

  return pickCheckpoint(entry, quantization, modelName);
}

function pickCheckpoint(entry: HfCheckpoints, quantization: string | undefined, modelName: string): string {
  const q = quantization?.toLowerCase() ?? "fp16";

  // Try exact match first
  if (q === "vptq" && entry.vptq) return entry.vptq;
  if (q === "awq" && entry.awq) return entry.awq;
  if (q === "gptq" && entry.gptq) return entry.gptq;
  if (q === "fp16") return entry.fp16;

  // Fallback: if requested quant doesn't have a checkpoint, try alternatives
  if ((q === "vptq" || q === "awq" || q === "gptq") && !entry[q as keyof HfCheckpoints]) {
    // Prefer AWQ > GPTQ > FP16 as fallback
    const fallback = entry.awq ?? entry.gptq ?? entry.fp16;
    const fallbackQuant = entry.awq ? "awq" : entry.gptq ? "gptq" : "fp16";
    log.warn("Requested quantization checkpoint not available, falling back", {
      modelName, requested: q, fallback: fallbackQuant,
    });
    return fallback;
  }

  return entry.fp16;
}

// ── vLLM container ──────────────────────────────────

async function createVllmContainer(
  instanceId: string,
  config: ModelInstanceConfig,
): Promise<{ containerId: string; ip: string; port: number }> {
  const containerName = `pilox-vllm-${sanitizeName(config.modelName)}-${instanceId.slice(0, 8)}`;
  const hostPort = await findFreePort(8001, 8099);
  const hfModelName = resolveVllmModelName(config.modelName, config.quantization);

  log.info("vLLM model name resolved", { original: config.modelName, quantization: config.quantization, resolved: hfModelName });

  // Build vLLM args — image entrypoint is ["vllm","serve"], so Cmd is just model + flags.
  // Model as positional arg (--model flag deprecated in v0.13+).
  const vllmArgs = [
    hfModelName,
    "--host", "0.0.0.0", "--port", "8000",
    "--max-model-len", String(config.maxContextLen),
    "--gpu-memory-utilization", "0.9",
    "--trust-remote-code",
  ];

  if (config.cpuOffloadGB > 0) {
    vllmArgs.push("--cpu-offload-gb", String(config.cpuOffloadGB));
  }
  if (config.prefixCaching) {
    vllmArgs.push("--enable-prefix-caching");
  }
  // Quantization: pre-quantized checkpoints already have the right weights,
  // but vLLM still needs the --quantization flag to know how to interpret them.
  // Only pass the flag if we're actually using a quantized checkpoint (not FP16).
  const resolvedQuant = config.vptq ? "vptq" : config.quantization;
  if (resolvedQuant === "vptq" && hfModelName.toLowerCase().includes("vptq")) {
    vllmArgs.push("--quantization", "vptq");
  } else if (resolvedQuant === "awq" && hfModelName.toLowerCase().includes("awq")) {
    vllmArgs.push("--quantization", "awq");
  } else if (resolvedQuant === "gptq" && hfModelName.toLowerCase().includes("gptq")) {
    vllmArgs.push("--quantization", "gptq");
  }
  // Don't pass --quantization for FP16 or if checkpoint doesn't match quant type

  // KV cache quantization (TurboQuant → FP8 KV cache in vLLM)
  if (config.turboQuant) {
    vllmArgs.push("--kv-cache-dtype", "fp8");
  }

  const createOpts: Record<string, unknown> = {
    Image: VLLM_IMAGE,
    name: containerName,
    Cmd: vllmArgs,
    Env: [
      `HUGGING_FACE_HUB_TOKEN=${process.env.HUGGING_FACE_HUB_TOKEN || ""}`,
    ],
    ExposedPorts: { "8000/tcp": {} },
    HostConfig: {
      // Share vLLM HuggingFace cache so models aren't re-downloaded
      Binds: ["pilox_vllm_data:/root/.cache/huggingface"],
      PortBindings: { "8000/tcp": [{ HostPort: String(hostPort) }] },
      NetworkMode: PILOX_NETWORK,
      RestartPolicy: { Name: "unless-stopped" },
      // GPU access
      DeviceRequests: [{
        Driver: "nvidia",
        Count: -1, // all GPUs
        Capabilities: [["gpu"]],
      }],
    },
    Labels: {
      "pilox-managed": "true",
      "pilox-type": "model-instance",
      "pilox-model": config.modelName,
      "pilox-instance-id": instanceId,
    },
  };

  const container = await docker.createContainer(createOpts as Parameters<typeof docker.createContainer>[0]);
  await container.start();

  return {
    containerId: container.id,
    ip: containerName, // Docker DNS resolves container name
    port: 8000,
  };
}

// ── Ollama container ────────────────────────────────

async function createOllamaContainer(
  instanceId: string,
  config: ModelInstanceConfig,
): Promise<{ containerId: string; ip: string; port: number }> {
  const containerName = `pilox-ollama-${sanitizeName(config.modelName)}-${instanceId.slice(0, 8)}`;
  const hostPort = await findFreePort(11435, 11499);

  const createOpts: Record<string, unknown> = {
    Image: OLLAMA_IMAGE,
    name: containerName,
    ExposedPorts: { "11434/tcp": {} },
    HostConfig: {
      // Share the Ollama data volume so already-pulled models are available
      Binds: ["pilox_ollama_data:/root/.ollama"],
      PortBindings: { "11434/tcp": [{ HostPort: String(hostPort) }] },
      NetworkMode: PILOX_NETWORK,
      RestartPolicy: { Name: "unless-stopped" },
      // GPU access (auto-detected by Ollama)
      DeviceRequests: [{
        Driver: "nvidia",
        Count: -1,
        Capabilities: [["gpu"]],
      }],
    },
    Labels: {
      "pilox-managed": "true",
      "pilox-type": "model-instance",
      "pilox-model": config.modelName,
      "pilox-instance-id": instanceId,
    },
  };

  const container = await docker.createContainer(createOpts as Parameters<typeof docker.createContainer>[0]);
  await container.start();

  // Pull the model inside the Ollama container (fire-and-forget, status tracked via polling)
  pullModelInOllama(containerName, config.modelName, instanceId).catch((err) => {
    log.error("Ollama model pull failed", { model: config.modelName, error: err instanceof Error ? err.message : String(err) });
  });

  return {
    containerId: container.id,
    ip: containerName,
    port: 11434,
  };
}

/**
 * Pull a model inside an Ollama container with streaming progress.
 * Progress is stored in `pullProgressMap` so the SSE endpoint can relay it.
 */
async function pullModelInOllama(containerHost: string, modelName: string, dbInstanceId: string): Promise<void> {
  // Wait for Ollama to be ready
  for (let i = 0; i < 30; i++) {
    try {
      const resp = await fetch(`http://${containerHost}:11434/api/tags`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (resp.ok) break;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 2_000));
  }

  // Init progress tracking
  pullProgressMap.set(dbInstanceId, { completed: 0, total: 0, status: "starting" });

  // Pull with streaming enabled — Ollama sends NDJSON lines
  const resp = await fetch(`http://${containerHost}:11434/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: modelName, stream: true }),
    signal: AbortSignal.timeout(1_800_000), // 30 min timeout for very large models
  });

  if (!resp.ok || !resp.body) {
    const body = await resp.text().catch(() => "");
    pullProgressMap.delete(dbInstanceId);
    await db.update(modelInstances)
      .set({ status: "error", error: `Pull failed: ${body.slice(0, 200)}`, updatedAt: new Date() })
      .where(eq(modelInstances.id, dbInstanceId));
    return;
  }

  // Parse NDJSON stream from Ollama
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line) as {
            status?: string;
            completed?: number;
            total?: number;
            error?: string;
          };

          if (evt.error) {
            pullProgressMap.delete(dbInstanceId);
            await db.update(modelInstances)
              .set({ status: "error", error: evt.error.slice(0, 500), updatedAt: new Date() })
              .where(eq(modelInstances.id, dbInstanceId));
            return;
          }

          // Update in-memory progress
          pullProgressMap.set(dbInstanceId, {
            completed: evt.completed ?? 0,
            total: evt.total ?? 0,
            status: evt.status ?? "downloading",
          });
        } catch { /* malformed JSON line, skip */ }
      }
    }

    // Pull complete
    pullProgressMap.delete(dbInstanceId);
    await db.update(modelInstances)
      .set({ status: "running", updatedAt: new Date() })
      .where(eq(modelInstances.id, dbInstanceId));
    log.info("Model pulled and running", { model: modelName, instanceId: dbInstanceId });
  } catch (err) {
    pullProgressMap.delete(dbInstanceId);
    const errorMsg = err instanceof Error ? err.message : String(err);
    await db.update(modelInstances)
      .set({ status: "error", error: `Pull stream error: ${errorMsg.slice(0, 200)}`, updatedAt: new Date() })
      .where(eq(modelInstances.id, dbInstanceId));
    log.error("Ollama pull stream failed", { model: modelName, error: errorMsg });
  }
}

// ── Stop / destroy ──────────────────────────────────

export async function stopModelInstance(id: string): Promise<void> {
  const [row] = await db.select().from(modelInstances).where(eq(modelInstances.id, id)).limit(1);
  if (!row || !row.instanceId) return;

  try {
    const container = docker.getContainer(row.instanceId);
    await container.stop({ t: 10 }).catch(() => {});
    await container.remove({ force: true }).catch(() => {});
  } catch (err) {
    log.warn("Failed to stop container", { id, error: err instanceof Error ? err.message : String(err) });
  }

  await db.update(modelInstances)
    .set({ status: "stopped", instanceId: null, instanceIp: null, updatedAt: new Date() })
    .where(eq(modelInstances.id, id));

  log.info("Model instance stopped", { id, model: row.modelName });
}

export async function destroyModelInstance(id: string): Promise<void> {
  await stopModelInstance(id);
  await db.delete(modelInstances).where(eq(modelInstances.id, id));
  log.info("Model instance destroyed", { id });
}

// ── List / get ──────────────────────────────────────

export async function listModelInstances(): Promise<ModelInstance[]> {
  const rows = await db.select().from(modelInstances).orderBy(modelInstances.createdAt);
  return rows.map(rowToInstance);
}

export async function getModelInstance(id: string): Promise<ModelInstance | null> {
  const [row] = await db.select().from(modelInstances).where(eq(modelInstances.id, id)).limit(1);
  return row ? rowToInstance(row) : null;
}

export async function getInstanceForModel(modelName: string): Promise<ModelInstance | null> {
  const [row] = await db.select().from(modelInstances)
    .where(eq(modelInstances.modelName, modelName))
    .limit(1);
  return row ? rowToInstance(row) : null;
}

// ── Update ──────────────────────────────────────────

async function updateModelInstance(id: string, config: ModelInstanceConfig): Promise<ModelInstance> {
  // Stop existing container
  await stopModelInstance(id);

  // Update DB
  await db.update(modelInstances).set({
    backend: config.backend,
    quantization: config.quantization,
    turboQuant: config.turboQuant,
    speculativeDecoding: config.speculativeDecoding,
    speculativeModel: config.speculativeModel,
    cpuOffloadGB: config.cpuOffloadGB,
    maxContextLen: config.maxContextLen,
    prefixCaching: config.prefixCaching,
    vptq: config.vptq,
    gpuEnabled: config.gpuEnabled,
    status: "creating",
    error: null,
    updatedAt: new Date(),
  }).where(eq(modelInstances.id, id));

  // Recreate container with new settings
  const containerInfo = config.backend === "vllm"
    ? await createVllmContainer(id, config)
    : await createOllamaContainer(id, config);

  await db.update(modelInstances).set({
    instanceId: containerInfo.containerId,
    instanceIp: containerInfo.ip,
    port: containerInfo.port,
    status: "pulling",
    updatedAt: new Date(),
  }).where(eq(modelInstances.id, id));

  const [row] = await db.select().from(modelInstances).where(eq(modelInstances.id, id)).limit(1);
  return rowToInstance(row!);
}

// ── Helpers ─────────────────────────────────────────

function rowToInstance(row: typeof modelInstances.$inferSelect): ModelInstance {
  return {
    id: row.id,
    modelName: row.modelName,
    displayName: row.displayName,
    backend: row.backend,
    status: row.status,
    instanceId: row.instanceId,
    instanceIp: row.instanceIp,
    port: row.port ?? 11434,
    quantization: row.quantization,
    turboQuant: row.turboQuant ?? false,
    speculativeDecoding: row.speculativeDecoding ?? false,
    cpuOffloadGB: row.cpuOffloadGB ?? 0,
    maxContextLen: row.maxContextLen ?? 8192,
    prefixCaching: row.prefixCaching ?? false,
    vptq: row.vptq ?? false,
    gpuEnabled: row.gpuEnabled ?? false,
    error: row.error,
  };
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 40);
}

async function findFreePort(min: number, max: number): Promise<number> {
  const containers = await docker.listContainers({ all: true });
  const usedPorts = new Set<number>();

  for (const c of containers) {
    for (const p of c.Ports || []) {
      if (typeof p === "object" && "PublicPort" in p) {
        usedPorts.add((p as { PublicPort: number }).PublicPort);
      }
    }
  }

  for (let port = min; port <= max; port++) {
    if (!usedPorts.has(port)) return port;
  }

  throw new Error(`No free port in range ${min}-${max}`);
}
