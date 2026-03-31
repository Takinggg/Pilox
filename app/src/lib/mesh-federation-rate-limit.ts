import type { Env } from "@/lib/env";
import {
  checkRateLimitWithConfig,
  rateLimitResponse,
  type SlidingWindowRateLimitConfig,
} from "@/lib/rate-limit";

const KEY_PREFIX = "pilox:rl:federation";

export function meshFederationRateLimitRedisConfig(
  e: Pick<
    Env,
    "MESH_FEDERATION_RATE_LIMIT_MAX" | "MESH_FEDERATION_RATE_LIMIT_WINDOW_MS"
  >
): SlidingWindowRateLimitConfig {
  return {
    keyPrefix: KEY_PREFIX,
    maxRequests: e.MESH_FEDERATION_RATE_LIMIT_MAX,
    windowMs: e.MESH_FEDERATION_RATE_LIMIT_WINDOW_MS,
  };
}

/** Inbound federation JSON-RPC (`X-Pilox-Federation-JWT` or legacy secret) — bucket per client IP. */
export async function enforceMeshFederationInboundRateLimit(
  clientIp: string,
  e: Pick<
    Env,
    "MESH_FEDERATION_RATE_LIMIT_MAX" | "MESH_FEDERATION_RATE_LIMIT_WINDOW_MS"
  >
): Promise<Response | undefined> {
  const result = await checkRateLimitWithConfig(
    `in:${clientIp}`,
    meshFederationRateLimitRedisConfig(e)
  );
  if (!result.allowed) return rateLimitResponse(result);
  return undefined;
}

/** Operator federation proxy — bucket per operator identity (user id or fallback). */
export async function enforceMeshFederationProxyRateLimit(
  operatorKey: string,
  e: Pick<
    Env,
    "MESH_FEDERATION_RATE_LIMIT_MAX" | "MESH_FEDERATION_RATE_LIMIT_WINDOW_MS"
  >
): Promise<Response | undefined> {
  const result = await checkRateLimitWithConfig(
    `proxy:${operatorKey}`,
    meshFederationRateLimitRedisConfig(e)
  );
  if (!result.allowed) return rateLimitResponse(result);
  return undefined;
}
