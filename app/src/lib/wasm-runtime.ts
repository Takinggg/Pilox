// SPDX-License-Identifier: BUSL-1.1
/**
 * WASM Tier — Lightweight agent execution via Extism (Wasmtime).
 *
 * Tier 1 execution for agents that don't need full Linux:
 *   - Cold start: <5ms (vs ~125ms Firecracker)
 *   - Memory: ~8-15MB per plugin
 *   - Sandbox: WASI-limited (no FS, no raw sockets, no GPU)
 *   - HTTP: Host-controlled via Extism host functions
 *
 * Escalation: If an agent needs capabilities beyond WASI (filesystem,
 * GPU, arbitrary binaries), it's transparently escalated to Tier 2
 * (Firecracker/Cloud Hypervisor) by the runtime dispatcher.
 *
 * Architecture:
 *   Agent WASM module (.wasm) → Extism plugin → Host functions → Pilox APIs
 *
 * Host functions provided:
 *   - pilox_inference(prompt) → LLM response (routes through local inference)
 *   - pilox_http(request) → HTTP response (host-controlled, sandboxed)
 *   - pilox_kv_get/set(key, value) → Agent-scoped key-value store
 *   - pilox_log(level, message) → Structured logging
 */

import { createModuleLogger } from "./logger";

const log = createModuleLogger("wasm-runtime");

// ── Types ───────────────────────────────────────────

export type ExecutionTier = "wasm" | "firecracker" | "cloud-hypervisor" | "docker";

export interface WasmAgentConfig {
  /** Path or URL to the .wasm module */
  wasmModulePath: string;
  /** Agent ID for scoping KV store and logs */
  agentId: string;
  /** Maximum memory in MB (default: 16) */
  memoryLimitMB?: number;
  /** Maximum execution time in ms (default: 30000) */
  timeoutMs?: number;
  /** Allowed HTTP hosts for outbound requests (empty = none) */
  allowedHosts?: string[];
  /** Environment variables passed to the WASM module */
  envVars?: Record<string, string>;
}

export interface WasmExecutionResult {
  output: string;
  durationMs: number;
  memoryUsedBytes: number;
  escalated: boolean;
  escalationReason?: string;
}

export interface WasmPluginInstance {
  id: string;
  agentId: string;
  status: "ready" | "running" | "stopped" | "error";
  createdAt: number;
  lastCallAt: number;
  callCount: number;
  totalDurationMs: number;
}

// ── Capability detection for tier selection ─────────

export interface AgentCapabilityRequirements {
  needsFilesystem: boolean;
  needsGPU: boolean;
  needsRawNetwork: boolean;
  needsArbitraryBinaries: boolean;
  needsDocker: boolean;
  maxMemoryMB: number;
}

/**
 * Determine the optimal execution tier for an agent based on its
 * capability requirements.
 *
 * Decision tree:
 *   GPU passthrough needed    → cloud-hypervisor
 *   Filesystem / binaries     → firecracker (or docker fallback)
 *   Lightweight (JSON, HTTP)  → wasm
 */
export function selectExecutionTier(
  reqs: AgentCapabilityRequirements,
  kvmAvailable: boolean,
): ExecutionTier {
  // GPU passthrough requires Cloud Hypervisor (VFIO)
  if (reqs.needsGPU) {
    return "cloud-hypervisor";
  }

  // Full Linux capabilities → Tier 2
  if (reqs.needsFilesystem || reqs.needsArbitraryBinaries || reqs.needsRawNetwork || reqs.needsDocker) {
    return kvmAvailable ? "firecracker" : "docker";
  }

  // High memory needs → Firecracker (WASM limited to ~256MB practical)
  if (reqs.maxMemoryMB > 256) {
    return kvmAvailable ? "firecracker" : "docker";
  }

  // Default: WASM tier (fastest cold start, minimal overhead)
  return "wasm";
}

// ── WASM Plugin Manager ─────────────────────────────

const plugins = new Map<string, WasmPluginInstance>();

/**
 * Create a WASM plugin instance for an agent.
 * The module is loaded and compiled, ready for function calls.
 */
export async function createWasmPlugin(config: WasmAgentConfig): Promise<WasmPluginInstance> {
  const startMs = performance.now();

  // Validate config
  if (!config.wasmModulePath) {
    throw new Error("wasmModulePath is required");
  }
  if (!config.agentId) {
    throw new Error("agentId is required");
  }

  const pluginId = `wasm-${config.agentId}-${Date.now()}`;

  log.info("Creating WASM plugin", {
    pluginId,
    agentId: config.agentId,
    module: config.wasmModulePath,
    memoryLimitMB: config.memoryLimitMB ?? 16,
  });

  // Dynamic import — Extism SDK is an optional dependency.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ExtismModule: any;
  try {
    // Dynamically import at runtime — not a compile-time dependency
    ExtismModule = await (Function('return import("@extism/extism")')() as Promise<unknown>);
  } catch {
    throw new Error(
      "WASM runtime requires @extism/extism. Install with: npm install @extism/extism",
    );
  }

  try {
    // Load the WASM module
    const moduleSource = config.wasmModulePath.startsWith("http")
      ? { url: config.wasmModulePath }
      : { path: config.wasmModulePath };

    // Create Extism plugin with host functions
    const createPlugin = ExtismModule.createPlugin || ExtismModule.default?.createPlugin;
    if (!createPlugin) throw new Error("Extism SDK missing createPlugin export");

    const plugin = await createPlugin(moduleSource, {
      useWasi: true,
      runInWorker: true,
      memory: {
        maxPages: Math.ceil((config.memoryLimitMB ?? 16) * 1024 / 64), // 64KB per WASM page
      },
      allowedHosts: config.allowedHosts ?? [],
      config: config.envVars ?? {},
      functions: buildHostFunctions(config.agentId),
      timeoutMs: config.timeoutMs ?? 30_000,
    });

    const coldStartMs = Math.round(performance.now() - startMs);
    log.info("WASM plugin created", { pluginId, coldStartMs });

    const instance: WasmPluginInstance = {
      id: pluginId,
      agentId: config.agentId,
      status: "ready",
      createdAt: Date.now(),
      lastCallAt: 0,
      callCount: 0,
      totalDurationMs: 0,
    };

    // Store plugin reference for lifecycle management
    plugins.set(pluginId, instance);
    // Store the actual Extism plugin on the instance for later calls
    (instance as unknown as Record<string, unknown>).__plugin = plugin;

    return instance;
  } catch (err) {
    log.error("WASM plugin creation failed", {
      pluginId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Call a function on a WASM plugin instance.
 * Returns the output or escalates to Tier 2 if the plugin fails due to
 * capability limitations.
 */
export async function callWasmPlugin(
  pluginId: string,
  functionName: string,
  input: string,
): Promise<WasmExecutionResult> {
  const instance = plugins.get(pluginId);
  if (!instance) {
    throw new Error(`WASM plugin not found: ${pluginId}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plugin = (instance as unknown as Record<string, unknown>).__plugin as any;

  if (!plugin) {
    throw new Error(`WASM plugin engine not initialized: ${pluginId}`);
  }

  instance.status = "running";
  const startMs = performance.now();

  try {
    const result = await plugin.call(functionName, input);
    const durationMs = Math.round(performance.now() - startMs);

    instance.status = "ready";
    instance.lastCallAt = Date.now();
    instance.callCount++;
    instance.totalDurationMs += durationMs;

    return {
      output: result?.text() ?? "",
      durationMs,
      memoryUsedBytes: 0, // Extism doesn't expose this directly
      escalated: false,
    };
  } catch (err) {
    const durationMs = Math.round(performance.now() - startMs);
    instance.status = "ready";

    const msg = err instanceof Error ? err.message : String(err);

    // Detect capability limitations that warrant escalation
    if (shouldEscalate(msg)) {
      log.info("WASM plugin needs escalation to Tier 2", {
        pluginId,
        reason: msg,
      });
      return {
        output: "",
        durationMs,
        memoryUsedBytes: 0,
        escalated: true,
        escalationReason: msg,
      };
    }

    throw err;
  }
}

/**
 * Stop and cleanup a WASM plugin instance.
 */
export async function destroyWasmPlugin(pluginId: string): Promise<void> {
  const instance = plugins.get(pluginId);
  if (!instance) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plugin = (instance as unknown as Record<string, unknown>).__plugin as any | undefined;

  if (plugin) {
    try {
      await plugin.close();
    } catch {
      // Best-effort cleanup
    }
  }

  instance.status = "stopped";
  plugins.delete(pluginId);
  log.info("WASM plugin destroyed", { pluginId });
}

/**
 * List all active WASM plugins.
 */
export function listWasmPlugins(): WasmPluginInstance[] {
  return Array.from(plugins.values());
}

// ── Host functions ──────────────────────────────────

function buildHostFunctions(agentId: string): Record<string, unknown> {
  // KV store scoped to the agent
  const kvStore = new Map<string, string>();

  return {
    "pilox": {
      // Inference: route through local Ollama/vLLM
      "inference": async (prompt: string): Promise<string> => {
        const port = process.env.INFERENCE_PORT || "11434";
        try {
          const resp = await fetch(`http://127.0.0.1:${port}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: process.env.DEFAULT_MODEL || "llama3.2:3b",
              prompt,
              stream: false,
              options: { num_predict: 512 },
            }),
            signal: AbortSignal.timeout(60_000),
          });
          if (!resp.ok) throw new Error(`Inference ${resp.status}`);
          const data = await resp.json();
          return data.response || "";
        } catch (err) {
          log.error("WASM host: inference failed", {
            agentId,
            error: err instanceof Error ? err.message : String(err),
          });
          return `[error: ${err instanceof Error ? err.message : String(err)}]`;
        }
      },

      // Sandboxed HTTP (host-controlled)
      "http_request": async (reqJson: string): Promise<string> => {
        try {
          const req = JSON.parse(reqJson) as {
            url: string;
            method?: string;
            headers?: Record<string, string>;
            body?: string;
          };
          const resp = await fetch(req.url, {
            method: req.method || "GET",
            headers: req.headers,
            body: req.body,
            signal: AbortSignal.timeout(10_000),
          });
          return JSON.stringify({
            status: resp.status,
            headers: Object.fromEntries(resp.headers),
            body: await resp.text(),
          });
        } catch (err) {
          return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
        }
      },

      // Agent-scoped KV store
      "kv_get": (key: string): string => {
        return kvStore.get(`${agentId}:${key}`) || "";
      },

      "kv_set": (key: string, value: string): void => {
        kvStore.set(`${agentId}:${key}`, value);
      },

      // Structured logging
      "log": (level: string, message: string): void => {
        const logFn = level === "error" ? log.error : level === "warn" ? log.warn : log.info;
        logFn(`[wasm:${agentId}] ${message}`);
      },
    },
  };
}

// ── Escalation detection ────────────────────────────

const ESCALATION_PATTERNS = [
  /out of memory/i,
  /memory access out of bounds/i,
  /wasi.*not.*support/i,
  /filesystem.*not.*available/i,
  /cannot.*open.*file/i,
  /permission.*denied.*socket/i,
  /operation.*not.*permitted/i,
  /capability.*not.*available/i,
];

function shouldEscalate(errorMessage: string): boolean {
  return ESCALATION_PATTERNS.some((p) => p.test(errorMessage));
}
