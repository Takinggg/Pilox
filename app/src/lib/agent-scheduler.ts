// SPDX-License-Identifier: BUSL-1.1
/**
 * Agent Scheduler — Resource-aware placement with affinity/anti-affinity.
 *
 * When a new agent starts, the scheduler selects the optimal host and
 * execution tier based on:
 *   1. Resource requirements (CPU, memory, GPU)
 *   2. Affinity rules (co-locate with specific agents)
 *   3. Anti-affinity rules (spread across hosts)
 *   4. Available capacity on each node
 *   5. Execution tier suitability (WASM vs Firecracker vs Docker)
 *
 * Architecture:
 *   Agent.start() → Scheduler.schedule() → select node + tier → Runtime.create()
 *
 * In single-node mode (default), the scheduler just picks the tier.
 * In multi-node mode, it distributes across the cluster via the node registry.
 */

import { createModuleLogger } from "./logger";
import { selectExecutionTier, type AgentCapabilityRequirements, type ExecutionTier } from "./wasm-runtime";
import { existsSync } from "node:fs";

const log = createModuleLogger("agent-scheduler");

// ── Types ───────────────────────────────────────────

export interface NodeInfo {
  /** Unique node identifier */
  nodeId: string;
  /** Hostname or IP */
  address: string;
  /** Total CPU cores */
  totalCpuCores: number;
  /** Used CPU cores (by running agents) */
  usedCpuCores: number;
  /** Total memory in MB */
  totalMemoryMB: number;
  /** Used memory in MB */
  usedMemoryMB: number;
  /** GPU available for passthrough */
  hasGPU: boolean;
  /** Number of GPUs available */
  gpuCount: number;
  /** GPUs currently in use */
  gpuUsed: number;
  /** KVM available (for Firecracker) */
  kvmAvailable: boolean;
  /** TEE available (TDX/SEV-SNP) */
  teeAvailable: boolean;
  /** Node health status */
  healthy: boolean;
  /** Last heartbeat timestamp */
  lastHeartbeat: number;
  /** Running agent count */
  runningAgents: number;
  /** Maximum agents allowed */
  maxAgents: number;
  /** Node labels for affinity matching */
  labels: Record<string, string>;
}

export interface SchedulingRequest {
  agentId: string;
  /** CPU requirement in cores (fractional ok) */
  cpuCores: number;
  /** Memory requirement in MB */
  memoryMB: number;
  /** Needs GPU passthrough */
  needsGPU: boolean;
  /** Needs confidential computing */
  needsConfidential: boolean;
  /** Agent capability requirements (for tier selection) */
  capabilities: AgentCapabilityRequirements;
  /** Affinity: prefer to co-locate with these agents */
  affinityAgentIds?: string[];
  /** Anti-affinity: avoid co-locating with these agents */
  antiAffinityAgentIds?: string[];
  /** Node selector: only schedule on nodes with these labels */
  nodeSelector?: Record<string, string>;
  /** Preferred execution tier (optional hint — scheduler may override) */
  preferredTier?: ExecutionTier;
}

export interface SchedulingDecision {
  /** Selected node */
  nodeId: string;
  /** Selected execution tier */
  tier: ExecutionTier;
  /** Score (higher = better fit, for debugging) */
  score: number;
  /** Reason for the decision */
  reason: string;
  /** Warnings (e.g., capacity tight) */
  warnings: string[];
}

// ── Scoring weights ─────────────────────────────────

const WEIGHTS = {
  /** Prefer nodes with more free resources */
  resourceAvailability: 40,
  /** Prefer nodes that satisfy affinity */
  affinity: 25,
  /** Penalize nodes that violate anti-affinity */
  antiAffinity: -30,
  /** Prefer nodes with fewer agents (spread) */
  agentSpread: 15,
  /** Prefer the optimal execution tier */
  tierMatch: 10,
  /** Penalize nodes near capacity */
  capacityPressure: -20,
} as const;

// ── Node Registry ───────────────────────────────────

// In-memory registry for single-node mode.
// Multi-node: backed by Redis or etcd.
let nodeRegistry: NodeInfo[] = [];
let agentPlacements = new Map<string, string>(); // agentId → nodeId

/**
 * Register a node in the scheduler. Call at startup for each node.
 * In single-node mode, call once with the local node info.
 */
export function registerNode(node: NodeInfo): void {
  const idx = nodeRegistry.findIndex((n) => n.nodeId === node.nodeId);
  if (idx >= 0) {
    nodeRegistry[idx] = node;
  } else {
    nodeRegistry.push(node);
  }
  log.info("Node registered", { nodeId: node.nodeId, cpuCores: node.totalCpuCores, memoryMB: node.totalMemoryMB });
}

/**
 * Remove a node from the registry.
 */
export function deregisterNode(nodeId: string): void {
  nodeRegistry = nodeRegistry.filter((n) => n.nodeId !== nodeId);
  log.info("Node deregistered", { nodeId });
}

/**
 * Update node resource usage. Called periodically by each node.
 */
export function updateNodeResources(
  nodeId: string,
  update: Partial<Pick<NodeInfo, "usedCpuCores" | "usedMemoryMB" | "gpuUsed" | "runningAgents" | "healthy">>,
): void {
  const node = nodeRegistry.find((n) => n.nodeId === nodeId);
  if (node) {
    Object.assign(node, update, { lastHeartbeat: Date.now() });
  }
}

/**
 * Record where an agent was placed (for affinity/anti-affinity lookups).
 */
export function recordPlacement(agentId: string, nodeId: string): void {
  agentPlacements.set(agentId, nodeId);
}

/**
 * Remove a placement record when an agent is destroyed.
 */
export function removePlacement(agentId: string): void {
  agentPlacements.delete(agentId);
}

// ── Scheduler ───────────────────────────────────────

/**
 * Schedule an agent on the optimal node and execution tier.
 *
 * Algorithm:
 *   1. Filter nodes that can satisfy hard constraints (resources, GPU, TEE, labels)
 *   2. Score remaining nodes by soft constraints (affinity, spread, capacity)
 *   3. Select the highest-scoring node
 *   4. Determine the execution tier for that node
 */
export function schedule(request: SchedulingRequest): SchedulingDecision {
  const candidates = nodeRegistry.filter((n) => n.healthy);

  if (candidates.length === 0) {
    // Single-node fallback: create a synthetic local node
    const localNode = buildLocalNodeInfo();
    candidates.push(localNode);
  }

  // ── Step 1: Hard constraint filtering ─────────────
  const eligible = candidates.filter((node) => {
    // Resource check
    const freeCpu = node.totalCpuCores - node.usedCpuCores;
    const freeMem = node.totalMemoryMB - node.usedMemoryMB;
    if (freeCpu < request.cpuCores) return false;
    if (freeMem < request.memoryMB) return false;

    // GPU check
    if (request.needsGPU && (!node.hasGPU || node.gpuUsed >= node.gpuCount)) return false;

    // Confidential check
    if (request.needsConfidential && !node.teeAvailable) return false;

    // Max agents check
    if (node.runningAgents >= node.maxAgents) return false;

    // Node selector check
    if (request.nodeSelector) {
      for (const [key, value] of Object.entries(request.nodeSelector)) {
        if (node.labels[key] !== value) return false;
      }
    }

    return true;
  });

  if (eligible.length === 0) {
    log.warn("No eligible nodes for scheduling", {
      agentId: request.agentId,
      cpuCores: request.cpuCores,
      memoryMB: request.memoryMB,
      needsGPU: request.needsGPU,
      totalNodes: candidates.length,
    });

    // Best-effort: return local node with warnings
    const localNode = buildLocalNodeInfo();
    const tier = selectExecutionTier(request.capabilities, localNode.kvmAvailable);
    return {
      nodeId: localNode.nodeId,
      tier,
      score: 0,
      reason: "No eligible nodes — falling back to local node",
      warnings: ["Insufficient cluster capacity. Agent may experience resource contention."],
    };
  }

  // ── Step 2: Score each eligible node ──────────────
  const scored = eligible.map((node) => ({
    node,
    score: scoreNode(node, request),
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const tier = selectExecutionTier(request.capabilities, best.node.kvmAvailable);

  // ── Step 3: Build decision ────────────────────────
  const warnings: string[] = [];

  const cpuUtilAfter = (best.node.usedCpuCores + request.cpuCores) / best.node.totalCpuCores;
  const memUtilAfter = (best.node.usedMemoryMB + request.memoryMB) / best.node.totalMemoryMB;

  if (cpuUtilAfter > 0.85) {
    warnings.push(`Node CPU will be at ${Math.round(cpuUtilAfter * 100)}% after placement.`);
  }
  if (memUtilAfter > 0.85) {
    warnings.push(`Node memory will be at ${Math.round(memUtilAfter * 100)}% after placement.`);
  }

  const reason = [
    `Best node: ${best.node.nodeId} (score: ${best.score})`,
    `Tier: ${tier}`,
    `Free: ${(best.node.totalCpuCores - best.node.usedCpuCores).toFixed(1)} CPU, ${best.node.totalMemoryMB - best.node.usedMemoryMB}MB RAM`,
    scored.length > 1 ? `Considered ${scored.length} nodes` : "Single node",
  ].join(". ");

  log.info("Scheduling decision", {
    agentId: request.agentId,
    nodeId: best.node.nodeId,
    tier,
    score: best.score,
  });

  return {
    nodeId: best.node.nodeId,
    tier,
    score: best.score,
    reason,
    warnings,
  };
}

// ── Scoring function ────────────────────────────────

function scoreNode(node: NodeInfo, request: SchedulingRequest): number {
  let score = 0;

  // Resource availability (0-100 → weighted)
  const cpuFreeRatio = (node.totalCpuCores - node.usedCpuCores) / node.totalCpuCores;
  const memFreeRatio = (node.totalMemoryMB - node.usedMemoryMB) / node.totalMemoryMB;
  const resourceScore = (cpuFreeRatio + memFreeRatio) / 2;
  score += resourceScore * WEIGHTS.resourceAvailability;

  // Affinity: prefer nodes where affinity agents are already running
  if (request.affinityAgentIds?.length) {
    const colocated = request.affinityAgentIds.filter(
      (id) => agentPlacements.get(id) === node.nodeId,
    ).length;
    score += (colocated / request.affinityAgentIds.length) * WEIGHTS.affinity;
  }

  // Anti-affinity: penalize nodes where anti-affinity agents are running
  if (request.antiAffinityAgentIds?.length) {
    const conflicts = request.antiAffinityAgentIds.filter(
      (id) => agentPlacements.get(id) === node.nodeId,
    ).length;
    if (conflicts > 0) {
      score += (conflicts / request.antiAffinityAgentIds.length) * WEIGHTS.antiAffinity;
    }
  }

  // Agent spread: prefer nodes with fewer agents (load balancing)
  const agentUtilization = node.runningAgents / Math.max(1, node.maxAgents);
  score += (1 - agentUtilization) * WEIGHTS.agentSpread;

  // Tier match: bonus if the node supports the optimal tier
  if (request.preferredTier) {
    const optimalTier = selectExecutionTier(request.capabilities, node.kvmAvailable);
    if (optimalTier === request.preferredTier) {
      score += WEIGHTS.tierMatch;
    }
  }

  // Capacity pressure: penalize nodes near resource limits
  if (cpuFreeRatio < 0.15 || memFreeRatio < 0.15) {
    score += WEIGHTS.capacityPressure;
  }

  return Math.round(score * 10) / 10;
}

// ── Local node info (single-node fallback) ──────────

function buildLocalNodeInfo(): NodeInfo {
  const os = require("node:os");
  const totalMem = Math.round(os.totalmem() / 1024 / 1024);
  const freeMem = Math.round(os.freemem() / 1024 / 1024);
  const cpus = os.cpus().length;

  return {
    nodeId: "local",
    address: "127.0.0.1",
    totalCpuCores: cpus,
    usedCpuCores: 0,
    totalMemoryMB: totalMem,
    usedMemoryMB: totalMem - freeMem,
    hasGPU: false, // Can't reliably detect without nvidia-smi
    gpuCount: 0,
    gpuUsed: 0,
    kvmAvailable: existsSync("/dev/kvm"),
    teeAvailable: existsSync("/dev/tdx_guest") || existsSync("/dev/sev-guest"),
    healthy: true,
    lastHeartbeat: Date.now(),
    runningAgents: 0,
    maxAgents: Math.max(10, cpus * 2),
    labels: { "node.pilox.io/type": "local" },
  };
}

// ── Public utilities ────────────────────────────────

/**
 * Get all registered nodes (for dashboard/API).
 */
export function getRegisteredNodes(): NodeInfo[] {
  return [...nodeRegistry];
}

/**
 * Get the current placement map (agentId → nodeId).
 */
export function getAgentPlacements(): Map<string, string> {
  return new Map(agentPlacements);
}

/**
 * Mark unhealthy nodes that haven't sent a heartbeat in the threshold.
 */
export function markStaleNodes(thresholdMs: number = 60_000): string[] {
  const now = Date.now();
  const stale: string[] = [];

  for (const node of nodeRegistry) {
    if (node.nodeId === "local") continue; // Local node is always healthy
    if (now - node.lastHeartbeat > thresholdMs && node.healthy) {
      node.healthy = false;
      stale.push(node.nodeId);
      log.warn("Node marked unhealthy (stale heartbeat)", {
        nodeId: node.nodeId,
        lastHeartbeat: new Date(node.lastHeartbeat).toISOString(),
      });
    }
  }

  return stale;
}
