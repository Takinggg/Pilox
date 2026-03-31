import { A2AServiceServer } from '../../grpc/pb/a2a_services.js';
import { A2ARequestHandler } from '../request_handler/a2a_request_handler.js';
import { UserBuilder } from './common.js';
/**
 * Options for configuring the gRPC handler.
 */
export interface GrpcServiceOptions {
    requestHandler: A2ARequestHandler;
    userBuilder: UserBuilder;
}
/**
 * Creates a gRPC transport handler.
 * This handler implements the A2A gRPC service definition and acts as an
 * adapter between the gRPC transport layer and the core A2A request handler.
 *
 * @param requestHandler - The core A2A request handler for business logic.
 * @returns An object that implements the A2AServiceServer interface.
 *
 * @example
 * ```ts
 * const server = new grpc.Server();
 * const requestHandler = new DefaultRequestHandler(...);
 * server.addService(A2AService, grpcService({ requestHandler, userBuilder: UserBuilder.noAuthentication }));
 * ```
 */
export declare function grpcService(options: GrpcServiceOptions): A2AServiceServer;
//# sourceMappingURL=grpc_service.d.ts.map