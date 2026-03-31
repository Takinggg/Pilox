import type { Env } from "@/lib/env";
import { getRedis } from "@/lib/redis";
import { createModuleLogger } from "@/lib/logger";
import { publicJsonRpcRateLimitedResponse } from "@/lib/a2a/public-jsonrpc-early-response";
import type { RateLimitResult } from "@/lib/rate-limit";

const log = createModuleLogger("mesh.public.reputation");

function repCounterKey(kind: "rate_limited" | "rpc_error", hash: string): string {
  return `pilox:mesh:pub_rep:${kind}:${hash}`;
}

export type PublicReputationBlockEnv = Pick<
  Env,
  | "A2A_PUBLIC_JSONRPC_REPUTATION_ENABLED"
  | "A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_ENABLED"
  | "A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_BAD_EVENT_THRESHOLD"
  | "A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_RETRY_AFTER_SECONDS"
>;

/**
 * When reputation block is enabled and `repHash` is set (API key or identity header),
 * denies the request with the same JSON-RPC 429 shape as rate limits if
 * `rate_limited` + `rpc_error` Redis counters meet the threshold.
 * Fails open if Redis errors.
 */
export async function enforcePublicReputationBlockIfNeeded(
  e: PublicReputationBlockEnv,
  repHash: string | null
): Promise<Response | undefined> {
  if (!e.A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_ENABLED || !repHash) {
    return undefined;
  }
  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    const keys = [
      repCounterKey("rate_limited", repHash),
      repCounterKey("rpc_error", repHash),
    ];
    const vals = await r.mget(...keys);
    let bad = 0;
    for (const v of vals) {
      if (v == null || v === "") continue;
      const n = parseInt(String(v), 10);
      if (!Number.isNaN(n)) bad += n;
    }
    const threshold = e.A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_BAD_EVENT_THRESHOLD;
    if (bad < threshold) return undefined;

    const retrySec = e.A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_RETRY_AFTER_SECONDS;
    const synthetic: RateLimitResult = {
      allowed: false,
      remaining: 0,
      retryAfterMs: retrySec * 1000,
      limit: threshold,
    };
    log.info("mesh.a2a.public_tier.reputation_blocked", {
      repHashPrefix: repHash.slice(0, 8),
      badEventSum: bad,
      threshold,
    });
    return publicJsonRpcRateLimitedResponse(synthetic);
  } catch (err) {
    log.warn("mesh.public.reputation.block_check_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}
