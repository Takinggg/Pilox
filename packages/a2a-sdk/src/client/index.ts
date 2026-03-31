// Pilox client exports
export { PiloxA2AClient } from './pilox-client.js';

// Re-export all upstream client types for drop-in compatibility
export { A2AClient } from '../core/client/client.js';
export type { A2AClientOptions } from '../core/client/client.js';
export * from '../core/client/auth-handler.js';
export {
  AgentCardResolver,
  type AgentCardResolverOptions,
  DefaultAgentCardResolver,
} from '../core/client/card-resolver.js';
export { Client, type ClientConfig, type RequestOptions } from '../core/client/multitransport-client.js';
export type { Transport, TransportFactory } from '../core/client/transports/transport.js';
export { ClientFactory, ClientFactoryOptions } from '../core/client/factory.js';
export {
  JsonRpcTransport,
  JsonRpcTransportFactory,
  type JsonRpcTransportOptions,
} from '../core/client/transports/json_rpc_transport.js';
export {
  RestTransport,
  RestTransportFactory,
  type RestTransportOptions,
} from '../core/client/transports/rest_transport.js';
export type {
  CallInterceptor,
  BeforeArgs,
  AfterArgs,
  ClientCallInput,
  ClientCallResult,
} from '../core/client/interceptors.js';
export {
  ServiceParameters,
  type ServiceParametersUpdate,
  withA2AExtensions,
} from '../core/client/service-parameters.js';
export { ClientCallContext, type ContextUpdate, ClientCallContextKey } from '../core/client/context.js';
export {
  AuthenticatedExtendedCardNotConfiguredError,
  ContentTypeNotSupportedError,
  InvalidAgentResponseError,
  PushNotificationNotSupportedError,
  TaskNotCancelableError,
  TaskNotFoundError,
  UnsupportedOperationError,
} from '../core/errors.js';
