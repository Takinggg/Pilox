import * as grpc from '@grpc/grpc-js';
import { TransportProtocolName } from '../../../core.js';
import { MessageSendParams, TaskPushNotificationConfig, TaskIdParams, ListTaskPushNotificationConfigParams, DeleteTaskPushNotificationConfigParams, TaskQueryParams, Task, AgentCard, GetTaskPushNotificationConfigParams } from '../../../types.js';
import { A2AStreamEventData, SendMessageResult } from '../../client.js';
import { RequestOptions } from '../../multitransport-client.js';
import { Transport, TransportFactory } from '../transport.js';
export interface GrpcTransportOptions {
    endpoint: string;
    grpcChannelCredentials?: grpc.ChannelCredentials;
    grpcCallOptions?: Partial<grpc.CallOptions>;
}
export declare class GrpcTransport implements Transport {
    private readonly grpcCallOptions?;
    private readonly grpcClient;
    constructor(options: GrpcTransportOptions);
    getExtendedAgentCard(options?: RequestOptions): Promise<AgentCard>;
    sendMessage(params: MessageSendParams, options?: RequestOptions): Promise<SendMessageResult>;
    sendMessageStream(params: MessageSendParams, options?: RequestOptions): AsyncGenerator<A2AStreamEventData, void, undefined>;
    setTaskPushNotificationConfig(params: TaskPushNotificationConfig, options?: RequestOptions): Promise<TaskPushNotificationConfig>;
    getTaskPushNotificationConfig(params: GetTaskPushNotificationConfigParams, options?: RequestOptions): Promise<TaskPushNotificationConfig>;
    listTaskPushNotificationConfig(params: ListTaskPushNotificationConfigParams, options?: RequestOptions): Promise<TaskPushNotificationConfig[]>;
    deleteTaskPushNotificationConfig(params: DeleteTaskPushNotificationConfigParams, options?: RequestOptions): Promise<void>;
    getTask(params: TaskQueryParams, options?: RequestOptions): Promise<Task>;
    cancelTask(params: TaskIdParams, options?: RequestOptions): Promise<Task>;
    resubscribeTask(params: TaskIdParams, options?: RequestOptions): AsyncGenerator<A2AStreamEventData, void, undefined>;
    private _sendGrpcRequest;
    private _sendGrpcStreamingRequest;
    private isServiceError;
    private _buildMetadata;
    private static mapToError;
}
export declare class GrpcTransportFactoryOptions {
    grpcChannelCredentials?: grpc.ChannelCredentials;
    grpcCallOptions?: Partial<grpc.CallOptions>;
}
export declare class GrpcTransportFactory implements TransportFactory {
    private readonly options?;
    static readonly protocolKey: TransportProtocolName;
    constructor(options?: GrpcTransportFactoryOptions);
    get protocolName(): string;
    create(url: string, _agentCard: AgentCard): Promise<Transport>;
}
//# sourceMappingURL=grpc_transport.d.ts.map