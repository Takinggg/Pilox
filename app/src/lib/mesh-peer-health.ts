// SPDX-License-Identifier: BUSL-1.1
import { getRedis } from "./redis";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("mesh-peer-health");

const HEALTH_KEY_PREFIX = "pilox:mesh:peer:health:";
const HEALTH_TTL_SEC = 600; // 10 minutes
const PROBE_TIMEOUT_MS = 10_000;

export interface PeerHealthStatus {
  origin: string;
  healthy: boolean;
  lastProbeAt: string;
  latencyMs: number;
  errorCount: number;
  lastError?: string;
}

/**
 * Probe a peer's health by fetching its agent card endpoint.
 * Stores result in Redis for fast lookup.
 */
export async function probePeerHealth(origin: string): Promise<PeerHealthStatus> {
  const start = Date.now();
  let healthy = false;
  let lastError: string | undefined;

  try {
    const url = `${origin}/.well-known/agent-card.json`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    healthy = res.ok;
    if (!res.ok) lastError = `HTTP ${res.status}`;
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }

  const latencyMs = Date.now() - start;
  const status: PeerHealthStatus = {
    origin,
    healthy,
    lastProbeAt: new Date().toISOString(),
    latencyMs,
    errorCount: 0,
    lastError,
  };

  // Update Redis
  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    const key = `${HEALTH_KEY_PREFIX}${encodeURIComponent(origin)}`;

    // Increment error count if unhealthy
    const prev = await r.get(key);
    if (prev) {
      try {
        const prevStatus = JSON.parse(prev) as PeerHealthStatus;
        status.errorCount = healthy ? 0 : (prevStatus.errorCount || 0) + 1;
      } catch { /* ignore parse error */ }
    }

    await r.set(key, JSON.stringify(status), "EX", HEALTH_TTL_SEC);
  } catch (err) {
    log.warn("peer_health_redis_error", { origin, error: err instanceof Error ? err.message : String(err) });
  }

  return status;
}

/**
 * Get cached health status for a peer.
 */
export async function getPeerHealth(origin: string): Promise<PeerHealthStatus | null> {
  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    const key = `${HEALTH_KEY_PREFIX}${encodeURIComponent(origin)}`;
    const raw = await r.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Probe all peers and return health statuses.
 * Skips peers that have been healthy recently (within TTL).
 */
export async function probeAllPeers(origins: string[]): Promise<PeerHealthStatus[]> {
  const results: PeerHealthStatus[] = [];
  for (const origin of origins) {
    const cached = await getPeerHealth(origin);
    // Re-probe if no cache, unhealthy, or stale (>5 min)
    if (!cached || !cached.healthy || Date.now() - new Date(cached.lastProbeAt).getTime() > 300_000) {
      results.push(await probePeerHealth(origin));
    } else {
      results.push(cached);
    }
  }
  return results;
}

/**
 * Check if a peer should be evicted (too many consecutive failures).
 * Returns true if peer has failed 5+ consecutive health checks.
 */
export function shouldEvictPeer(status: PeerHealthStatus): boolean {
  return status.errorCount >= 5;
}
