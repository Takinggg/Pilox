import { JSONRPCResponse } from '../../../types.js';
import { ServerCallContext } from '../../context.js';
import { A2ARequestHandler } from '../../request_handler/a2a_request_handler.js';
/**
 * Handles JSON-RPC transport layer, routing requests to A2ARequestHandler.
 */
export declare class JsonRpcTransportHandler {
    private requestHandler;
    constructor(requestHandler: A2ARequestHandler);
    /**
     * Handles an incoming JSON-RPC request.
     * For streaming methods, it returns an AsyncGenerator of JSONRPCResult.
     * For non-streaming methods, it returns a Promise of a single JSONRPCMessage (Result or ErrorResponse).
     */
    handle(requestBody: any, context?: ServerCallContext): Promise<JSONRPCResponse | AsyncGenerator<JSONRPCResponse, void, undefined>>;
    private isRequestValid;
    private paramsAreValid;
}
//# sourceMappingURL=jsonrpc_transport_handler.d.ts.map