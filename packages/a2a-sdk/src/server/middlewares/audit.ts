import type { AuditConfig } from '../../config/types.js';
import type { Middleware, ServerMiddlewareContext } from '../../middleware/types.js';
import { HashChain } from '../../audit/hash-chain.js';
import { InMemoryAuditStore } from '../../audit/stores/memory.js';

export function createAuditMiddleware(
  config: AuditConfig,
): Middleware<ServerMiddlewareContext> {
  const store = config.store ?? new InMemoryAuditStore();
  let chainPromise: Promise<HashChain> | undefined;

  function getChain(): Promise<HashChain> {
    if (!chainPromise) {
      chainPromise = HashChain.fromStore(store);
    }
    return chainPromise;
  }

  return {
    name: 'pilox:audit',
    priority: 100,
    enabled: true,
    execute: async (ctx, next) => {
      const chain = await getChain();
      const agentId = ctx.remoteAgentCard?.name ?? 'unknown';
      const taskId = extractTaskId(ctx) ?? ctx.requestId;

      // Log inbound request
      await chain.append(agentId, taskId, `${ctx.method}.received`, {
        requestId: ctx.requestId,
      });

      const start = Date.now();
      try {
        await next();
      } finally {
        const durationMs = Date.now() - start;
        const action = ctx.error
          ? `${ctx.method}.error`
          : `${ctx.method}.completed`;

        await chain.append(agentId, taskId, action, {
          requestId: ctx.requestId,
          durationMs,
          error: ctx.error?.message,
        });
      }
    },
  };
}

function extractTaskId(ctx: ServerMiddlewareContext): string | undefined {
  const params = ctx.params as Record<string, unknown> | undefined;
  if (!params) return undefined;

  // message/send -> params.message.taskId
  const message = params['message'] as Record<string, unknown> | undefined;
  if (message?.['taskId']) return String(message['taskId']);

  // tasks/get, tasks/cancel -> params.id
  if (params['id']) return String(params['id']);

  return undefined;
}
