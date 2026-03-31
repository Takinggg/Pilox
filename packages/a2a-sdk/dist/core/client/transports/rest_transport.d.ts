import { TransportProtocolName } from '../../core.js';
import { AgentCard, DeleteTaskPushNotificationConfigParams, GetTaskPushNotificationConfigParams, ListTaskPushNotificationConfigParams, MessageSendParams, TaskPushNotificationConfig, TaskIdParams, TaskQueryParams, Task } from '../../types.js';
import { A2AStreamEventData, SendMessageResult } from '../client.js';
import { RequestOptions } from '../multitransport-client.js';
import { Transport, TransportFactory } from './transport.js';
export interface RestTransportOptions {
    endpoint: string;
    fetchImpl?: typeof fetch;
}
export declare class RestTransport implements Transport {
    private readonly customFetchImpl?;
    private readonly endpoint;
    constructor(options: RestTransportOptions);
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
    private _fetch;
    private _buildHeaders;
    private _sendRequest;
    private _handleErrorResponse;
    private _sendStreamingRequest;
    private _processSseEventData;
    private static mapToError;
}
export interface RestTransportFactoryOptions {
    fetchImpl?: typeof fetch;
}
export declare class RestTransportFactory implements TransportFactory {
    private readonly options?;
    static readonly protocolKey: TransportProtocolName;
    constructor(options?: RestTransportFactoryOptions);
    get protocolName(): string;
    create(url: string, _agentCard: AgentCard): Promise<Transport>;
}
//# sourceMappingURL=rest_transport.d.ts.map