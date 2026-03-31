import { RequestHandler } from 'express';
import { AgentCard } from '../../types.js';
export interface AgentCardHandlerOptions {
    agentCardProvider: AgentCardProvider;
}
export type AgentCardProvider = {
    getAgentCard(): Promise<AgentCard>;
} | (() => Promise<AgentCard>);
/**
 * Creates Express.js middleware to handle agent card requests.
 *
 * @example
 * ```ts
 * // With an existing A2ARequestHandler instance:
 * app.use('/.well-known/agent-card.json', agentCardHandler({ agentCardProvider: a2aRequestHandler }));
 * // or with a factory lambda:
 * app.use('/.well-known/agent-card.json', agentCardHandler({ agentCardProvider: async () => agentCard }));
 * ```
 */
export declare function agentCardHandler(options: AgentCardHandlerOptions): RequestHandler;
//# sourceMappingURL=agent_card_handler.d.ts.map