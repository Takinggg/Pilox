import { ErrorRequestHandler, RequestHandler } from 'express';
import { A2ARequestHandler } from '../request_handler/a2a_request_handler.js';
import { UserBuilder } from './common.js';
export interface JsonRpcHandlerOptions {
    requestHandler: A2ARequestHandler;
    userBuilder: UserBuilder;
}
/**
 * Creates Express.js middleware to handle A2A JSON-RPC requests.
 * @example
 *
 * ```ts
 * // Handle at root
 * app.use(jsonRpcHandler({ requestHandler: a2aRequestHandler, userBuilder: UserBuilder.noAuthentication }));
 * // or
 * app.use('/a2a/json-rpc', jsonRpcHandler({ requestHandler: a2aRequestHandler, userBuilder: UserBuilder.noAuthentication }));
 * ```
 */
export declare function jsonRpcHandler(options: JsonRpcHandlerOptions): RequestHandler;
export declare const jsonErrorHandler: ErrorRequestHandler;
//# sourceMappingURL=json_rpc_handler.d.ts.map