import type { AgentCard } from '../core/types.js';
import type { ServerMiddlewareContext, ClientMiddlewareContext } from './types.js';
/**
 * Create a server-side middleware context for an inbound request.
 */
export declare function createServerContext(method: string, params: unknown, localAgentCard: AgentCard): ServerMiddlewareContext;
/**
 * Create a client-side middleware context for an outbound request.
 */
export declare function createClientContext(method: string, params: unknown, localAgentCard: AgentCard, remoteAgentCard?: AgentCard): ClientMiddlewareContext;
//# sourceMappingURL=context.d.ts.map