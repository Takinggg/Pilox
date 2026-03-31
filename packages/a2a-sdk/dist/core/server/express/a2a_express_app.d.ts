import { Express, RequestHandler, ErrorRequestHandler } from 'express';
import { A2ARequestHandler } from '../request_handler/a2a_request_handler.js';
import { UserBuilder } from './common.js';
/**
 * @deprecated Use specific middlewares ({@link jsonRpcHandler}, {@link agentCardHandler}) directly.
 */
export declare class A2AExpressApp {
    private requestHandler;
    private userBuilder;
    constructor(requestHandler: A2ARequestHandler, userBuilder?: UserBuilder);
    /**
     * Adds A2A routes to an existing Express app.
     * @param app Optional existing Express app.
     * @param baseUrl The base URL for A2A endpoints (e.g., "/a2a/api").
     * @param middlewares Optional array of Express middlewares to apply to the A2A routes.
     * @param agentCardPath Optional custom path for the agent card endpoint (defaults to .well-known/agent-card.json).
     * @returns The Express app with A2A routes.
     */
    setupRoutes(app: Express, baseUrl?: string, middlewares?: Array<RequestHandler | ErrorRequestHandler>, agentCardPath?: string): Express;
}
//# sourceMappingURL=a2a_express_app.d.ts.map