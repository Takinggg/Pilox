import type { RateLimitConfig } from '../../config/types.js';
import type { Middleware, ServerMiddlewareContext } from '../../middleware/types.js';
import { TokenBucket } from '../../security/rate-limit/token-bucket.js';

export function createRateLimitMiddleware(
  config: RateLimitConfig,
): Middleware<ServerMiddlewareContext> {
  const bucket = new TokenBucket(config);
  const strategy = config.strategy ?? 'agent-id';

  return {
    name: 'pilox:rate-limit',
    priority: 200,
    enabled: true,
    execute: async (ctx, next) => {
      const key = strategy === 'agent-id'
        ? (ctx.remoteAgentCard?.name ?? ctx.requestId)
        : ctx.requestId;

      const result = bucket.consume(key);
      if (!result.allowed) {
        ctx.error = new Error(
          `Rate limit exceeded for ${key}. Retry after ${result.retryAfterMs}ms`,
        );
        return;
      }

      await next();
    },
  };
}
