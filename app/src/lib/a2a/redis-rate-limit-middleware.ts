import type { Middleware, ServerMiddlewareContext } from "@pilox/a2a-sdk/middleware";
import { a2aRedisRateLimitAls } from "@/lib/a2a/a2a-rate-limit-context";
import { checkRateLimitWithConfig } from "@/lib/rate-limit";
import type { SlidingWindowRateLimitConfig } from "@/lib/rate-limit";

/**
 * Distributed A2A rate limit (Redis sliding window), same semantics as the SDK’s built-in limiter
 * but shared across all Node workers.
 */
export function createA2ARedisRateLimitMiddleware(
  config: SlidingWindowRateLimitConfig
): Middleware<ServerMiddlewareContext> {
  return {
    name: "pilox:a2a-redis-rate-limit",
    priority: 200,
    enabled: true,
    execute: async (ctx, next) => {
      const fromAls = a2aRedisRateLimitAls.getStore()?.callerKey;
      const key =
        ctx.remoteAgentCard?.name !== undefined && ctx.remoteAgentCard.name !== ""
          ? `agent:${ctx.remoteAgentCard.name}`
          : (fromAls ?? "caller:anonymous");

      const result = await checkRateLimitWithConfig(key, config);
      if (!result.allowed) {
        ctx.error = new Error(
          `Rate limit exceeded for ${key}. Retry after ${result.retryAfterMs}ms`
        );
        return;
      }

      await next();
    },
  };
}
