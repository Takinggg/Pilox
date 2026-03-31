import { RequestHandler } from 'express';
import { A2ARequestHandler } from '../request_handler/a2a_request_handler.js';
import { UserBuilder } from './common.js';
/**
 * Options for configuring the HTTP+JSON/REST handler.
 */
export interface RestHandlerOptions {
    requestHandler: A2ARequestHandler;
    userBuilder: UserBuilder;
}
/**
 * Creates Express.js middleware to handle A2A HTTP+JSON/REST requests.
 *
 * This handler implements the A2A REST API specification with snake_case
 * field names, providing endpoints for:
 * - Agent card retrieval (GET /v1/card)
 * - Message sending with optional streaming (POST /v1/message:send|stream)
 * - Task management (GET/POST /v1/tasks/:taskId:cancel|subscribe)
 * - Push notification configuration
 *
 * The handler acts as an adapter layer, converting between REST format
 * (snake_case) at the API boundary and internal TypeScript format (camelCase)
 * for business logic.
 *
 * @param options - Configuration options including the request handler
 * @returns Express router configured with all A2A REST endpoints
 *
 * @example
 * ```ts
 * const app = express();
 * const requestHandler = new DefaultRequestHandler(...);
 * app.use('/api/rest', restHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }));
 * ```
 */
export declare function restHandler(options: RestHandlerOptions): RequestHandler;
//# sourceMappingURL=rest_handler.d.ts.map