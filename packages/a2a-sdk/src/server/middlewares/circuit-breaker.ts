import type { CircuitBreakerConfig } from '../../config/types.js';
import type { Middleware, ServerMiddlewareContext } from '../../middleware/types.js';
import { CircuitBreakerRegistry } from '../../security/circuit-breaker/registry.js';

export function createCircuitBreakerMiddleware(
  config: CircuitBreakerConfig,
): Middleware<ServerMiddlewareContext> {
  const registry = new CircuitBreakerRegistry(config);

  return {
    name: 'pilox:circuit-breaker',
    priority: 300,
    enabled: true,
    execute: async (ctx, next) => {
      const agentId = ctx.remoteAgentCard?.name ?? 'unknown';
      const breaker = registry.getOrCreate(agentId);

      if (!breaker.canExecute()) {
        ctx.error = new Error(
          `Circuit breaker open for agent ${agentId}. Request rejected.`,
        );
        return;
      }

      try {
        await next();
        if (!ctx.error) {
          breaker.recordSuccess();
        } else {
          breaker.recordFailure();
        }
      } catch (err) {
        breaker.recordFailure();
        throw err;
      }
    },
  };
}
