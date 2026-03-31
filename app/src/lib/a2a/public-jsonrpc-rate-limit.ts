import { createHash } from "crypto";
import type { Env } from "@/lib/env";
import type { A2aJsonRpcEntrypointKind } from "@/lib/a2a/a2a-jsonrpc-entrypoint";
import { createModuleLogger } from "@/lib/logger";
import { publicJsonRpcRateLimitedResponse } from "@/lib/a2a/public-jsonrpc-early-response";
import {
  checkRateLimitWithConfig,
  type SlidingWindowRateLimitConfig,
} from "@/lib/rate-limit";
import { recordPublicPeerReputationEvent } from "@/lib/a2a/public-identity-reputation";

const KEY_PREFIX = "pilox:rl:public_a2a";
const ID_KEY_PREFIX = "pilox:rl:public_a2a_id";
const API_KEY_PREFIX = "pilox:rl:public_a2a_apikey";
const publicTierLog = createModuleLogger("a2a.jsonrpc.public");

/** Optional fields for `mesh.a2a.public_tier.rate_limited` when a request is blocked. */
export type PublicA2aJsonRpcRateLimitLogContext = {
  entrypoint: A2aJsonRpcEntrypointKind;
  clientIp: string;
  limitKind?: "ip" | "identity" | "api_key";
  identityKeyHashPrefix?: string;
};

/** Max length for IP (or proxy chain first hop) in Redis rate-limit keys. */
export const A2A_RATE_LIMIT_CLIENT_IP_MAX_LEN = 200;

/** Single normalization for public / JSON-RPC caller key suffixes. */
export function normalizeA2aRateLimitClientIp(raw: string): string {
  const t = raw.trim();
  if (!t) return "unknown";
  return t.slice(0, A2A_RATE_LIMIT_CLIENT_IP_MAX_LEN);
}

export function publicA2aRateLimitRedisConfig(
  e: Pick<
    Env,
    | "A2A_PUBLIC_JSONRPC_RATE_LIMIT_MAX"
    | "A2A_PUBLIC_JSONRPC_RATE_LIMIT_WINDOW_MS"
  >
): SlidingWindowRateLimitConfig {
  return {
    keyPrefix: KEY_PREFIX,
    maxRequests: e.A2A_PUBLIC_JSONRPC_RATE_LIMIT_MAX,
    windowMs: e.A2A_PUBLIC_JSONRPC_RATE_LIMIT_WINDOW_MS,
  };
}

export function publicA2aIdentityRateLimitRedisConfig(
  e: Pick<
    Env,
    | "A2A_PUBLIC_JSONRPC_IDENTITY_RATE_LIMIT_MAX"
    | "A2A_PUBLIC_JSONRPC_IDENTITY_RATE_LIMIT_WINDOW_MS"
  >
): SlidingWindowRateLimitConfig {
  return {
    keyPrefix: ID_KEY_PREFIX,
    maxRequests: e.A2A_PUBLIC_JSONRPC_IDENTITY_RATE_LIMIT_MAX,
    windowMs: e.A2A_PUBLIC_JSONRPC_IDENTITY_RATE_LIMIT_WINDOW_MS,
  };
}

export function publicA2aApiKeyRateLimitRedisConfig(
  e: Pick<
    Env,
    | "A2A_PUBLIC_JSONRPC_API_KEY_RATE_LIMIT_MAX"
    | "A2A_PUBLIC_JSONRPC_API_KEY_RATE_LIMIT_WINDOW_MS"
  >
): SlidingWindowRateLimitConfig {
  return {
    keyPrefix: API_KEY_PREFIX,
    maxRequests: e.A2A_PUBLIC_JSONRPC_API_KEY_RATE_LIMIT_MAX,
    windowMs: e.A2A_PUBLIC_JSONRPC_API_KEY_RATE_LIMIT_WINDOW_MS,
  };
}

export function hashPublicIdentityValue(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/**
 * When `A2A_PUBLIC_JSONRPC_IDENTITY_HEADER` is set, reads and hashes the header value (trim, max length).
 */
export function extractPublicIdentityFromRequest(
  req: Request,
  headerName: string,
  maxLen: number
): { hash: string } | null {
  const name = headerName.trim();
  if (!name) return null;
  const v = req.headers.get(name);
  if (v == null) return null;
  const t = v.trim();
  if (!t) return null;
  const clipped = t.slice(0, maxLen);
  return { hash: hashPublicIdentityValue(clipped) };
}

type PublicRlEnv = Pick<
  Env,
  | "A2A_PUBLIC_JSONRPC_RATE_LIMIT_MAX"
  | "A2A_PUBLIC_JSONRPC_RATE_LIMIT_WINDOW_MS"
  | "A2A_PUBLIC_JSONRPC_IDENTITY_RATE_LIMIT_MAX"
  | "A2A_PUBLIC_JSONRPC_IDENTITY_RATE_LIMIT_WINDOW_MS"
  | "A2A_PUBLIC_JSONRPC_API_KEY_RATE_LIMIT_MAX"
  | "A2A_PUBLIC_JSONRPC_API_KEY_RATE_LIMIT_WINDOW_MS"
  | "A2A_PUBLIC_JSONRPC_REPUTATION_ENABLED"
>;

/** Anonymous / public JSON-RPC — IP bucket; optional second bucket (API key hash or identity header hash). */
export async function enforcePublicA2aJsonRpcRateLimit(
  clientIp: string,
  e: PublicRlEnv,
  options?: {
    logContext?: PublicA2aJsonRpcRateLimitLogContext;
    identityHash?: string | null;
    apiKeyHash?: string | null;
  }
): Promise<Response | undefined> {
  const ipNorm = normalizeA2aRateLimitClientIp(clientIp);
  const ipResult = await checkRateLimitWithConfig(
    `ip:${ipNorm}`,
    publicA2aRateLimitRedisConfig(e)
  );
  if (!ipResult.allowed) {
    if (options?.logContext) {
      publicTierLog.info("mesh.a2a.public_tier.rate_limited", {
        entrypoint: options.logContext.entrypoint,
        clientIp: options.logContext.clientIp,
        limitKind: "ip" as const,
        limit: ipResult.limit,
        retryAfterMs: ipResult.retryAfterMs,
      });
    }
    return publicJsonRpcRateLimitedResponse(ipResult);
  }

  const apiKeyId = options?.apiKeyHash ?? null;
  const identityId = options?.identityHash ?? null;
  const secondId = apiKeyId ?? identityId;
  if (!secondId) return undefined;

  const useApiKeyBucket = apiKeyId != null;
  const idResult = await checkRateLimitWithConfig(
    `id:${secondId}`,
    useApiKeyBucket
      ? publicA2aApiKeyRateLimitRedisConfig(e)
      : publicA2aIdentityRateLimitRedisConfig(e)
  );
  if (!idResult.allowed) {
    void recordPublicPeerReputationEvent(e, secondId, "rate_limited");
    if (options?.logContext) {
      publicTierLog.info("mesh.a2a.public_tier.rate_limited", {
        entrypoint: options.logContext.entrypoint,
        clientIp: options.logContext.clientIp,
        limitKind: useApiKeyBucket ? ("api_key" as const) : ("identity" as const),
        identityKeyHashPrefix: secondId.slice(0, 8),
        limit: idResult.limit,
        retryAfterMs: idResult.retryAfterMs,
      });
    }
    return publicJsonRpcRateLimitedResponse(idResult);
  }
  return undefined;
}
