// SPDX-License-Identifier: BUSL-1.1
/**
 * VM Metrics → OpenTelemetry Gauges
 *
 * Periodically collects CPU/memory/network stats from all running VMs
 * and emits them as OTel gauge metrics. These flow through the existing
 * OTLP pipeline (configured via otel-bootstrap.ts) to your collector
 * (Prometheus, Grafana Cloud, Datadog, etc.).
 *
 * Metrics emitted:
 *   pilox.vm.cpu.percent          — CPU utilization per VM (0-100)
 *   pilox.vm.memory.used_bytes    — RSS bytes per VM
 *   pilox.vm.memory.limit_bytes   — Memory limit per VM
 *   pilox.vm.memory.percent       — Memory utilization (0-100)
 *   pilox.vm.network.rx_bytes     — Cumulative bytes received
 *   pilox.vm.network.tx_bytes     — Cumulative bytes transmitted
 *   pilox.vm.count                — Number of running VMs by hypervisor
 *
 * All gauges carry attributes: { vm.id, vm.name, vm.hypervisor }
 */

import { metrics, type ObservableGauge, type BatchObservableCallback } from "@opentelemetry/api";
import { listRunningVMs, getInstanceStats } from "./runtime";
import type { VMStats } from "./hypervisor";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("vm-metrics");

const METER_NAME = "pilox.vm";
const METER_VERSION = "1.0.0";
const COLLECT_INTERVAL_MS = 15_000; // 15s — aligned with Prometheus scrape interval

// ── State ───────────────────────────────────────────

interface VMSnapshot {
  vmId: string;
  name: string;
  hypervisor: string;
  stats: VMStats;
}

let snapshots: VMSnapshot[] = [];
let collectHandle: ReturnType<typeof setInterval> | null = null;
let registered = false;

// ── Collection loop ─────────────────────────────────

async function collectAllVMStats(): Promise<void> {
  try {
    const vms = await listRunningVMs();
    const results: VMSnapshot[] = [];

    // Collect stats in parallel (bounded to 20 concurrent)
    const BATCH_SIZE = 20;
    for (let i = 0; i < vms.length; i += BATCH_SIZE) {
      const batch = vms.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (vm) => {
          const stats = await getInstanceStats(vm.vmId);
          if (stats) {
            results.push({
              vmId: vm.vmId,
              name: vm.name,
              hypervisor: vm.hypervisor,
              stats,
            });
          }
        }),
      );
      // Log failures without breaking the loop
      for (const r of batchResults) {
        if (r.status === "rejected") {
          log.debug("Stats collection failed for VM", {
            error: r.reason instanceof Error ? r.reason.message : String(r.reason),
          });
        }
      }
    }

    snapshots = results;
  } catch (err) {
    log.error("VM stats collection failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── OTel gauge registration ─────────────────────────

function registerGauges(): void {
  if (registered) return;
  registered = true;

  const meter = metrics.getMeter(METER_NAME, METER_VERSION);

  const cpuPercent = meter.createObservableGauge("pilox.vm.cpu.percent", {
    description: "VM CPU utilization percentage",
    unit: "%",
  });

  const memUsed = meter.createObservableGauge("pilox.vm.memory.used_bytes", {
    description: "VM memory usage in bytes",
    unit: "By",
  });

  const memLimit = meter.createObservableGauge("pilox.vm.memory.limit_bytes", {
    description: "VM memory limit in bytes",
    unit: "By",
  });

  const memPercent = meter.createObservableGauge("pilox.vm.memory.percent", {
    description: "VM memory utilization percentage",
    unit: "%",
  });

  const netRx = meter.createObservableGauge("pilox.vm.network.rx_bytes", {
    description: "Cumulative bytes received by VM",
    unit: "By",
  });

  const netTx = meter.createObservableGauge("pilox.vm.network.tx_bytes", {
    description: "Cumulative bytes transmitted by VM",
    unit: "By",
  });

  const vmCount = meter.createObservableGauge("pilox.vm.count", {
    description: "Number of running VMs by hypervisor type",
    unit: "{vm}",
  });

  // Batch callback — OTel calls this on each metric export interval
  const batchCb: BatchObservableCallback = (observer) => {
    // Per-VM gauges
    for (const { vmId, name, hypervisor, stats } of snapshots) {
      const attrs = { "vm.id": vmId, "vm.name": name, "vm.hypervisor": hypervisor };

      observer.observe(cpuPercent, stats.cpu.percent, attrs);
      observer.observe(memUsed, stats.memory.usage, attrs);
      observer.observe(memLimit, stats.memory.limit, attrs);
      observer.observe(memPercent, stats.memory.percent, attrs);
      observer.observe(netRx, stats.network.rxBytes, attrs);
      observer.observe(netTx, stats.network.txBytes, attrs);
    }

    // Aggregate count by hypervisor
    const counts: Record<string, number> = {};
    for (const s of snapshots) {
      counts[s.hypervisor] = (counts[s.hypervisor] || 0) + 1;
    }
    for (const [hyp, count] of Object.entries(counts)) {
      observer.observe(vmCount, count, { "vm.hypervisor": hyp });
    }
  };

  meter.addBatchObservableCallback(
    batchCb,
    [cpuPercent, memUsed, memLimit, memPercent, netRx, netTx, vmCount],
  );
}

// ── Public API ──────────────────────────────────────

/**
 * Start periodic VM metrics collection + OTel gauge emission.
 * Call once at app startup. Idempotent.
 */
export function startVMMetrics(): void {
  if (collectHandle) return;

  const enabled = process.env.VM_METRICS_ENABLED !== "false";
  if (!enabled) {
    log.info("VM metrics disabled via VM_METRICS_ENABLED=false");
    return;
  }

  const intervalMs = Number(process.env.VM_METRICS_INTERVAL_MS || COLLECT_INTERVAL_MS);

  registerGauges();

  // Initial collection
  void collectAllVMStats();

  collectHandle = setInterval(() => {
    void collectAllVMStats();
  }, intervalMs);

  log.info("VM metrics started", { intervalMs });
}

/**
 * Stop the collection loop. Gauges remain registered (OTel handles cleanup).
 */
export function stopVMMetrics(): void {
  if (collectHandle) {
    clearInterval(collectHandle);
    collectHandle = null;
    log.info("VM metrics stopped");
  }
}

/**
 * Get latest snapshot (for API/debug use).
 */
export function getLatestVMSnapshots(): VMSnapshot[] {
  return snapshots;
}
