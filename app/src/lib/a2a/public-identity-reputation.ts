import type { Env } from "@/lib/env";
import { getRedis } from "@/lib/redis";
import { createModuleLogger } from "@/lib/logger";
import { recordMeshPublicReputationRedisSuccess } from "@/lib/mesh-otel";

const log = createModuleLogger("mesh.public.reputation");
const TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * Best-effort counters per hashed public identity or API key (when reputation tracking is enabled).
 * Keys: `pilox:mesh:pub_rep:{ok|rate_limited|rpc_error}:<sha256>`
 */
export async function recordPublicPeerReputationEvent(
  e: Pick<Env, "A2A_PUBLIC_JSONRPC_REPUTATION_ENABLED">,
  identityHash: string | null,
  kind: "ok" | "rate_limited" | "rpc_error"
): Promise<void> {
  if (!e.A2A_PUBLIC_JSONRPC_REPUTATION_ENABLED || !identityHash) return;
  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    const key = `pilox:mesh:pub_rep:${kind}:${identityHash}`;
    await r.incr(key);
    await r.expire(key, TTL_SECONDS);
    recordMeshPublicReputationRedisSuccess(kind);
  } catch (err) {
    log.warn("mesh.public.reputation.record_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
