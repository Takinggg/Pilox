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

// ── vLLM container ──────────────────────────────────

async function createVllmContainer(
  instanceId: string,
  config: ModelInstanceConfig,
): Promise<{ containerId: string; ip: string; port: number }> {
  const containerName = `pilox-vllm-${sanitizeName(config.modelName)}-${instanceId.slice(0, 8)}`;
  const hostPort = await findFreePort(8001, 8099);

  // Build vLLM serve command (new vllm CLI: `vllm serve <model> [options]`)
  const vllmArgs = [
    "serve", config.modelName,
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
  if (config.speculativeDecoding && config.speculativeModel) {
    vllmArgs.push("--speculative-model", config.speculativeModel);
    vllmArgs.push("--num-speculative-tokens", "5");
  }
  if (config.quantization === "awq" || config.quantization === "gptq") {
    vllmArgs.push("--quantization", config.quantization);
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
 * Pull a model inside an Ollama container and update DB status when done.
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

  // Pull the model
  const resp = await fetch(`http://${containerHost}:11434/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: modelName, stream: false }),
    signal: AbortSignal.timeout(600_000), // 10 min timeout for large models
  });

  if (resp.ok) {
    await db.update(modelInstances)
      .set({ status: "running", updatedAt: new Date() })
      .where(eq(modelInstances.id, dbInstanceId));
    log.info("Model pulled and running", { model: modelName, instanceId: dbInstanceId });
  } else {
    const body = await resp.text().catch(() => "");
    await db.update(modelInstances)
      .set({ status: "error", error: `Pull failed: ${body.slice(0, 200)}`, updatedAt: new Date() })
      .where(eq(modelInstances.id, dbInstanceId));
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
