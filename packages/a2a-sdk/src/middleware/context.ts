import { v4 as uuidv4 } from 'uuid';
import type { AgentCard } from '../core/types.js';
import type { ServerMiddlewareContext, ClientMiddlewareContext } from './types.js';

/**
 * Create a server-side middleware context for an inbound request.
 */
export function createServerContext(
  method: string,
  params: unknown,
  localAgentCard: AgentCard,
): ServerMiddlewareContext {
  return {
    direction: 'inbound',
    requestId: uuidv4(),
    timestamp: Date.now(),
    localAgentCard,
    metadata: new Map(),
    noiseSessionActive: false,
    method,
    params,
  };
}

/**
 * Create a client-side middleware context for an outbound request.
 */
export function createClientContext(
  method: string,
  params: unknown,
  localAgentCard: AgentCard,
  remoteAgentCard?: AgentCard,
): ClientMiddlewareContext {
  return {
    direction: 'outbound',
    requestId: uuidv4(),
    timestamp: Date.now(),
    localAgentCard,
    remoteAgentCard,
    metadata: new Map(),
    noiseSessionActive: false,
    method,
    params,
  };
}
