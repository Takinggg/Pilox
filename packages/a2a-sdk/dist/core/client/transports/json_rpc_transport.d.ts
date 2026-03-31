import { TransportProtocolName } from '../../core.js';
import { AuthenticatedExtendedCardNotConfiguredError, ContentTypeNotSupportedError, InvalidAgentResponseError, PushNotificationNotSupportedError, TaskNotCancelableError, TaskNotFoundError, UnsupportedOperationError } from '../../errors.js';
import { JSONRPCResponse, MessageSendParams, TaskPushNotificationConfig, TaskIdParams, ListTaskPushNotificationConfigParams, DeleteTaskPushNotificationConfigParams, TaskQueryParams, Task, JSONRPCErrorResponse, AgentCard, GetTaskPushNotificationConfigParams } from '../../types.js';
import { A2AStreamEventData, SendMessageResult } from '../client.js';
import { RequestOptions } from '../multitransport-client.js';
import { Transport, TransportFactory } from './transport.js';
export interface JsonRpcTransportOptions {
    endpoint: string;
    fetchImpl?: typeof fetch;
}
export declare class JsonRpcTransport implements Transport {
    private readonly customFetchImpl?;
    private readonly endpoint;
    private requestIdCounter;
    constructor(options: JsonRpcTransportOptions);
    getExtendedAgentCard(options?: RequestOptions, idOverride?: number): Promise<AgentCard>;
    sendMessage(params: MessageSendParams, options?: RequestOptions, idOverride?: number): Promise<SendMessageResult>;
    sendMessageStream(params: MessageSendParams, options?: RequestOptions): AsyncGenerator<A2AStreamEventData, void, undefined>;
    setTaskPushNotificationConfig(params: TaskPushNotificationConfig, options?: RequestOptions, idOverride?: number): Promise<TaskPushNotificationConfig>;
    getTaskPushNotificationConfig(params: GetTaskPushNotificationConfigParams, options?: RequestOptions, idOverride?: number): Promise<TaskPushNotificationConfig>;
    listTaskPushNotificationConfig(params: ListTaskPushNotificationConfigParams, options?: RequestOptions, idOverride?: number): Promise<TaskPushNotificationConfig[]>;
    deleteTaskPushNotificationConfig(params: DeleteTaskPushNotificationConfigParams, options?: RequestOptions, idOverride?: number): Promise<void>;
    getTask(params: TaskQueryParams, options?: RequestOptions, idOverride?: number): Promise<Task>;
    cancelTask(params: TaskIdParams, options?: RequestOptions, idOverride?: number): Promise<Task>;
    resubscribeTask(params: TaskIdParams, options?: RequestOptions): AsyncGenerator<A2AStreamEventData, void, undefined>;
    callExtensionMethod<TExtensionParams, TExtensionResponse extends JSONRPCResponse>(method: string, params: TExtensionParams, idOverride: number, options?: RequestOptions): Promise<TExtensionResponse>;
    private _fetch;
    private _sendRpcRequest;
    private _fetchRpc;
    private _sendStreamingRequest;
    private _processSseEventData;
    private static mapToError;
}
export declare class JsonRpcTransportFactoryOptions {
    fetchImpl?: typeof fetch;
}
export declare class JsonRpcTransportFactory implements TransportFactory {
    private readonly options?;
    /** Not named `name` — bundlers assign class names to read-only `Function#name`. */
    static readonly protocolKey: TransportProtocolName;
    constructor(options?: JsonRpcTransportFactoryOptions);
    get protocolName(): string;
    create(url: string, _agentCard: AgentCard): Promise<Transport>;
}
export declare class JSONRPCTransportError extends Error {
    errorResponse: JSONRPCErrorResponse;
    constructor(errorResponse: JSONRPCErrorResponse);
}
export declare class TaskNotFoundJSONRPCError extends TaskNotFoundError {
    errorResponse: JSONRPCErrorResponse;
    constructor(errorResponse: JSONRPCErrorResponse);
}
export declare class TaskNotCancelableJSONRPCError extends TaskNotCancelableError {
    errorResponse: JSONRPCErrorResponse;
    constructor(errorResponse: JSONRPCErrorResponse);
}
export declare class PushNotificationNotSupportedJSONRPCError extends PushNotificationNotSupportedError {
    errorResponse: JSONRPCErrorResponse;
    constructor(errorResponse: JSONRPCErrorResponse);
}
export declare class UnsupportedOperationJSONRPCError extends UnsupportedOperationError {
    errorResponse: JSONRPCErrorResponse;
    constructor(errorResponse: JSONRPCErrorResponse);
}
export declare class ContentTypeNotSupportedJSONRPCError extends ContentTypeNotSupportedError {
    errorResponse: JSONRPCErrorResponse;
    constructor(errorResponse: JSONRPCErrorResponse);
}
export declare class InvalidAgentResponseJSONRPCError extends InvalidAgentResponseError {
    errorResponse: JSONRPCErrorResponse;
    constructor(errorResponse: JSONRPCErrorResponse);
}
export declare class AuthenticatedExtendedCardNotConfiguredJSONRPCError extends AuthenticatedExtendedCardNotConfiguredError {
    errorResponse: JSONRPCErrorResponse;
    constructor(errorResponse: JSONRPCErrorResponse);
}
//# sourceMappingURL=json_rpc_transport.d.ts.map