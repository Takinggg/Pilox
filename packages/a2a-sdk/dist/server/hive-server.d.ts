import type { PiloxServerConfig } from '../config/types.js';
import { PiloxRequestHandler } from './pilox-request-handler.js';
import type { AgentCard } from '../core/types.js';
/**
 * PiloxA2AServer -- the main entry point for creating a secure A2A server.
 * Wraps the upstream DefaultRequestHandler with the middleware pipeline.
 */
export declare class PiloxA2AServer {
    readonly handler: PiloxRequestHandler;
    readonly agentCard: AgentCard;
    constructor(config: PiloxServerConfig);
}
//# sourceMappingURL=pilox-server.d.ts.map