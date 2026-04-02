// SPDX-License-Identifier: BUSL-1.1
/**
 * eBPF + Kepler Integration — Kernel-level observability for agents.
 *
 * Two components:
 *   1. Tetragon (Cilium) — Syscall tracing per VM/container
 *      - Detects process execution, file access, network connections
 *      - Enforces security policies at kernel level
 *      - Zero-overhead (eBPF programs run in kernel space)
 *
 *   2. Kepler (CNCF) — Energy monitoring per process/container
 *      - Estimates CPU/GPU/DRAM power consumption per agent
 *      - Uses hardware counters (RAPL) + eBPF process tracking
 *      - Exports Prometheus metrics for energy-aware scheduling
 *
 * Architecture:
 *   Tetragon daemon → gRPC API → Pilox adapter → OTel/Redis
 *   Kepler daemon → Prometheus → Pilox scrape → Agent energy metrics
 *
 * Prerequisites:
 *   - Tetragon: `helm install tetragon cilium/tetragon` or daemonset
 *   - Kepler: `helm install kepler kepler/kepler` or daemonset
 *   - Both require Linux kernel 5.8+ with BTF support
 */

import { createModuleLogger } from "./logger";
import { metrics, type Counter, type Histogram, type ObservableGauge } from "@opentelemetry/api";

const log = createModuleLogger("ebpf-integration");

// ── Types ───────────────────────────────────────────

export interface TetragonEvent {
  /** Event type (process_exec, process_exit, file_open, network_connect, etc.) */
  type: string;
  /** Timestamp (nanoseconds since epoch) */
  timestampNs: number;
  /** Process info */
  process: {
    pid: number;
    uid: number;
    binary: string;
    arguments: string;
    cwd: string;
  };
  /** Parent process info */
  parent?: {
    pid: number;
    binary: string;
  };
  /** Container/VM info (cgroup-based) */
  pod?: {
    name: string;
    namespace: string;
    container: { id: string; name: string };
  };
  /** Network connection info (for kprobe/network events) */
  network?: {
    srcAddr: string;
    srcPort: number;
    dstAddr: string;
    dstPort: number;
    protocol: string;
  };
  /** File access info (for kprobe/file events) */
  file?: {
    path: string;
    flags: string;
  };
  /** Policy that matched (if any) */
  policyName?: string;
  /** Action taken (allow, audit, block) */
  action?: string;
}

export interface KeplerMetrics {
  /** Agent/container ID */
  containerId: string;
  /** CPU energy in millijoules */
  cpuEnergyMJ: number;
  /** DRAM energy in millijoules */
  dramEnergyMJ: number;
  /** GPU energy in millijoules (if available) */
  gpuEnergyMJ: number;
  /** Total energy in millijoules */
  totalEnergyMJ: number;
  /** Collection timestamp */
  timestamp: number;
}

export interface SecurityPolicy {
  /** Policy name */
  name: string;
  /** What to trace */
  tracingPolicy: {
    /** Syscalls to monitor */
    syscalls?: string[];
    /** Binary execution patterns to monitor */
    binaryPatterns?: string[];
    /** File paths to monitor */
    filePaths?: string[];
    /** Network destinations to monitor */
    networkDests?: string[];
  };
  /** Action on match: audit (log only), block (prevent) */
  action: "audit" | "block";
  /** Apply to these container/VM name patterns */
  targetPatterns: string[];
}

// ── Tetragon Client ─────────────────────────────────

const TETRAGON_API = process.env.TETRAGON_API_ENDPOINT || "http://localhost:54321";

let tetragonRunning = false;
let eventBuffer: TetragonEvent[] = [];
const MAX_EVENT_BUFFER = 10_000;

/**
 * Connect to the Tetragon gRPC/HTTP API and start streaming events.
 * Events are buffered in memory and exposed via getRecentEvents().
 */
export async function startTetragonStream(): Promise<void> {
  if (tetragonRunning) return;

  const enabled = process.env.TETRAGON_ENABLED === "true";
  if (!enabled) {
    log.info("Tetragon integration disabled (set TETRAGON_ENABLED=true)");
    return;
  }

  log.info("Connecting to Tetragon", { endpoint: TETRAGON_API });

  try {
    // Health check
    const healthResp = await fetch(`${TETRAGON_API}/v1/health`, {
      signal: AbortSignal.timeout(5_000),
    });

    if (!healthResp.ok) {
      log.warn("Tetragon not healthy", { status: healthResp.status });
      return;
    }

    tetragonRunning = true;
    registerTetragonMetrics();

    // Start event stream (Server-Sent Events)
    streamTetragonEvents().catch((err) => {
      log.error("Tetragon stream error", {
        error: err instanceof Error ? err.message : String(err),
      });
      tetragonRunning = false;
    });

    log.info("Tetragon stream started");
  } catch (err) {
    log.warn("Tetragon connection failed (not running?)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function streamTetragonEvents(): Promise<void> {
  // Tetragon exposes events via its gRPC-gateway HTTP API
  // POST /v1/events with a GetEventsRequest
  while (tetragonRunning) {
    try {
      const resp = await fetch(`${TETRAGON_API}/v1/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allow_list: [
            { event_set: ["PROCESS_EXEC", "PROCESS_EXIT"] },
            { event_set: ["PROCESS_KPROBE"] },
          ],
          // Stream for 60s then reconnect (keepalive)
          aggregation_options: { window_size: "60s" },
        }),
        signal: AbortSignal.timeout(70_000),
      });

      if (!resp.ok || !resp.body) {
        await new Promise((r) => setTimeout(r, 5_000));
        continue;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (tetragonRunning) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = parseTetragonEvent(JSON.parse(line));
            if (event) {
              addEvent(event);
              updateTetragonMetrics(event);
            }
          } catch {
            // skip malformed events
          }
        }
      }
    } catch (err) {
      if (tetragonRunning) {
        log.debug("Tetragon stream reconnecting", {
          error: err instanceof Error ? err.message : String(err),
        });
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }
  }
}

function parseTetragonEvent(raw: Record<string, unknown>): TetragonEvent | null {
  // Tetragon emits different event types with different structures
  const processExec = raw.process_exec as Record<string, unknown> | undefined;
  const processKprobe = raw.process_kprobe as Record<string, unknown> | undefined;

  const proc = (processExec?.process || processKprobe?.process) as Record<string, unknown> | undefined;
  if (!proc) return null;

  return {
    type: processExec ? "process_exec" : "process_kprobe",
    timestampNs: Number(raw.time || 0),
    process: {
      pid: Number(proc.pid || 0),
      uid: Number(proc.uid || 0),
      binary: String(proc.binary || ""),
      arguments: String(proc.arguments || ""),
      cwd: String(proc.cwd || ""),
    },
    parent: proc.parent ? {
      pid: Number((proc.parent as Record<string, unknown>).pid || 0),
      binary: String((proc.parent as Record<string, unknown>).binary || ""),
    } : undefined,
    pod: proc.pod ? {
      name: String((proc.pod as Record<string, unknown>).name || ""),
      namespace: String((proc.pod as Record<string, unknown>).namespace || ""),
      container: {
        id: String(((proc.pod as Record<string, unknown>).container as Record<string, unknown>)?.id || ""),
        name: String(((proc.pod as Record<string, unknown>).container as Record<string, unknown>)?.name || ""),
      },
    } : undefined,
    policyName: raw.policy_name ? String(raw.policy_name) : undefined,
    action: raw.action ? String(raw.action) : undefined,
  };
}

function addEvent(event: TetragonEvent): void {
  eventBuffer.push(event);
  if (eventBuffer.length > MAX_EVENT_BUFFER) {
    eventBuffer = eventBuffer.slice(-MAX_EVENT_BUFFER / 2);
  }
}

/**
 * Get recent Tetragon events, optionally filtered by container/VM.
 */
export function getRecentEvents(containerId?: string, limit = 100): TetragonEvent[] {
  let events = eventBuffer;
  if (containerId) {
    events = events.filter((e) => e.pod?.container.id === containerId);
  }
  return events.slice(-limit);
}

/**
 * Stop the Tetragon event stream.
 */
export function stopTetragonStream(): void {
  tetragonRunning = false;
  log.info("Tetragon stream stopped");
}

// ── Tetragon Security Policies ──────────────────────

/**
 * Apply a security tracing policy to Tetragon.
 * This creates a TracingPolicy CRD that Tetragon enforces at kernel level.
 */
export async function applySecurityPolicy(policy: SecurityPolicy): Promise<boolean> {
  log.info("Applying Tetragon security policy", { name: policy.name, action: policy.action });

  try {
    // Convert to Tetragon TracingPolicy format
    const tracingPolicy = buildTracingPolicy(policy);

    const resp = await fetch(`${TETRAGON_API}/v1/sensors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tracingPolicy),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      log.error("Failed to apply Tetragon policy", { name: policy.name, status: resp.status });
      return false;
    }

    log.info("Tetragon policy applied", { name: policy.name });
    return true;
  } catch (err) {
    log.error("Tetragon policy error", {
      name: policy.name,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

function buildTracingPolicy(policy: SecurityPolicy): Record<string, unknown> {
  const kprobes: Record<string, unknown>[] = [];

  // File monitoring
  if (policy.tracingPolicy.filePaths?.length) {
    kprobes.push({
      call: "sys_openat",
      syscall: true,
      args: [{ index: 1, type: "string" }],
      selectors: [{
        matchArgs: [{
          index: 1,
          operator: "Prefix",
          values: policy.tracingPolicy.filePaths,
        }],
        matchActions: [{ action: policy.action === "block" ? "Sigkill" : "Post" }],
      }],
    });
  }

  // Network monitoring
  if (policy.tracingPolicy.networkDests?.length) {
    kprobes.push({
      call: "tcp_connect",
      syscall: false,
      args: [{ index: 0, type: "sock" }],
      selectors: [{
        matchActions: [{ action: "Post" }],
      }],
    });
  }

  // Binary execution monitoring
  if (policy.tracingPolicy.binaryPatterns?.length) {
    kprobes.push({
      call: "sys_execve",
      syscall: true,
      args: [{ index: 0, type: "string" }],
      selectors: [{
        matchArgs: [{
          index: 0,
          operator: "Prefix",
          values: policy.tracingPolicy.binaryPatterns,
        }],
        matchActions: [{ action: policy.action === "block" ? "Sigkill" : "Post" }],
      }],
    });
  }

  return {
    apiVersion: "cilium.io/v1alpha1",
    kind: "TracingPolicy",
    metadata: { name: policy.name },
    spec: {
      kprobes,
      ...(policy.targetPatterns.length > 0 && {
        podSelector: {
          matchExpressions: [{
            key: "app.kubernetes.io/name",
            operator: "In",
            values: policy.targetPatterns,
          }],
        },
      }),
    },
  };
}

// ── Tetragon OTel Metrics ───────────────────────────

let tetragonInstruments: {
  processExecCount: Counter;
  securityBlockCount: Counter;
  eventRate: Histogram;
} | undefined;

function registerTetragonMetrics(): void {
  if (tetragonInstruments) return;

  const meter = metrics.getMeter("pilox.ebpf", "1.0.0");

  tetragonInstruments = {
    processExecCount: meter.createCounter("pilox.ebpf.process_exec_total", {
      description: "Total process executions observed by Tetragon",
    }),
    securityBlockCount: meter.createCounter("pilox.ebpf.security_block_total", {
      description: "Total actions blocked by Tetragon security policies",
    }),
    eventRate: meter.createHistogram("pilox.ebpf.event_rate", {
      description: "Tetragon events per second",
      unit: "1/s",
    }),
  };
}

function updateTetragonMetrics(event: TetragonEvent): void {
  if (!tetragonInstruments) return;

  const attrs = {
    "event.type": event.type,
    ...(event.pod?.container.name && { "container.name": event.pod.container.name }),
  };

  if (event.type === "process_exec") {
    tetragonInstruments.processExecCount.add(1, attrs);
  }

  if (event.action === "block" || event.action === "Sigkill") {
    tetragonInstruments.securityBlockCount.add(1, {
      ...attrs,
      "policy.name": event.policyName || "unknown",
    });
  }
}

// ── Kepler Energy Monitoring ────────────────────────

const KEPLER_ENDPOINT = process.env.KEPLER_ENDPOINT || "http://localhost:9103/metrics";
let keplerRunning = false;
let keplerHandle: ReturnType<typeof setInterval> | null = null;
let latestEnergyMetrics = new Map<string, KeplerMetrics>();

/**
 * Start scraping Kepler Prometheus metrics.
 * Kepler exposes per-container energy consumption via Prometheus format.
 */
export function startKeplerScraping(): void {
  if (keplerHandle) return;

  const enabled = process.env.KEPLER_ENABLED === "true";
  if (!enabled) {
    log.info("Kepler integration disabled (set KEPLER_ENABLED=true)");
    return;
  }

  const intervalMs = Number(process.env.KEPLER_SCRAPE_INTERVAL_MS || "15000");

  registerKeplerMetrics();

  keplerRunning = true;
  keplerHandle = setInterval(() => {
    scrapeKepler().catch((err) => {
      log.debug("Kepler scrape failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, intervalMs);

  log.info("Kepler scraping started", { endpoint: KEPLER_ENDPOINT, intervalMs });
}

async function scrapeKepler(): Promise<void> {
  try {
    const resp = await fetch(KEPLER_ENDPOINT, {
      signal: AbortSignal.timeout(5_000),
    });

    if (!resp.ok) return;

    const text = await resp.text();
    const containerMetrics = parseKeplerMetrics(text);

    for (const m of containerMetrics) {
      latestEnergyMetrics.set(m.containerId, m);
      updateKeplerOTel(m);
    }
  } catch {
    // Silent — Kepler may not be running
  }
}

function parseKeplerMetrics(prometheusText: string): KeplerMetrics[] {
  // Kepler exports metrics like:
  // kepler_container_joules_total{container_id="abc",mode="dynamic",resource="pkg"} 123.45
  // kepler_container_joules_total{container_id="abc",mode="dynamic",resource="dram"} 67.89

  const results = new Map<string, KeplerMetrics>();
  const lines = prometheusText.split("\n");

  for (const line of lines) {
    if (!line.startsWith("kepler_container_joules_total")) continue;

    const containerIdMatch = line.match(/container_id="([^"]+)"/);
    const resourceMatch = line.match(/resource="([^"]+)"/);
    const valueMatch = line.match(/}\s+([\d.]+)/);

    if (!containerIdMatch || !resourceMatch || !valueMatch) continue;

    const containerId = containerIdMatch[1];
    const resource = resourceMatch[1];
    const joules = parseFloat(valueMatch[1]);
    const millijoules = Math.round(joules * 1000);

    let entry = results.get(containerId);
    if (!entry) {
      entry = {
        containerId,
        cpuEnergyMJ: 0,
        dramEnergyMJ: 0,
        gpuEnergyMJ: 0,
        totalEnergyMJ: 0,
        timestamp: Date.now(),
      };
      results.set(containerId, entry);
    }

    switch (resource) {
      case "pkg": case "core":
        entry.cpuEnergyMJ += millijoules;
        break;
      case "dram": case "uncore":
        entry.dramEnergyMJ += millijoules;
        break;
      case "gpu":
        entry.gpuEnergyMJ += millijoules;
        break;
    }
    entry.totalEnergyMJ = entry.cpuEnergyMJ + entry.dramEnergyMJ + entry.gpuEnergyMJ;
  }

  return Array.from(results.values());
}

/**
 * Get energy metrics for a specific container/VM.
 */
export function getEnergyMetrics(containerId: string): KeplerMetrics | undefined {
  return latestEnergyMetrics.get(containerId);
}

/**
 * Get all energy metrics.
 */
export function getAllEnergyMetrics(): KeplerMetrics[] {
  return Array.from(latestEnergyMetrics.values());
}

/**
 * Stop Kepler scraping.
 */
export function stopKeplerScraping(): void {
  if (keplerHandle) {
    clearInterval(keplerHandle);
    keplerHandle = null;
    keplerRunning = false;
    log.info("Kepler scraping stopped");
  }
}

// ── Kepler OTel metrics ─────────────────────────────

let keplerGaugesRegistered = false;

function registerKeplerMetrics(): void {
  if (keplerGaugesRegistered) return;
  keplerGaugesRegistered = true;

  const meter = metrics.getMeter("pilox.energy", "1.0.0");

  const cpuEnergy = meter.createObservableGauge("pilox.energy.cpu_millijoules", {
    description: "CPU energy consumption in millijoules",
    unit: "mJ",
  });
  const dramEnergy = meter.createObservableGauge("pilox.energy.dram_millijoules", {
    description: "DRAM energy consumption in millijoules",
    unit: "mJ",
  });
  const gpuEnergy = meter.createObservableGauge("pilox.energy.gpu_millijoules", {
    description: "GPU energy consumption in millijoules",
    unit: "mJ",
  });
  const totalEnergy = meter.createObservableGauge("pilox.energy.total_millijoules", {
    description: "Total energy consumption in millijoules",
    unit: "mJ",
  });

  meter.addBatchObservableCallback(
    (observer) => {
      for (const [containerId, m] of latestEnergyMetrics) {
        const attrs = { "container.id": containerId };
        observer.observe(cpuEnergy, m.cpuEnergyMJ, attrs);
        observer.observe(dramEnergy, m.dramEnergyMJ, attrs);
        observer.observe(gpuEnergy, m.gpuEnergyMJ, attrs);
        observer.observe(totalEnergy, m.totalEnergyMJ, attrs);
      }
    },
    [cpuEnergy, dramEnergy, gpuEnergy, totalEnergy],
  );
}

function updateKeplerOTel(m: KeplerMetrics): void {
  // The batch observable callback handles export — this is just for
  // updating the in-memory map which the callback reads.
  // No-op since latestEnergyMetrics is already updated.
}
