import { MessageSendParams, TaskPushNotificationConfig, DeleteTaskPushNotificationConfigParams, ListTaskPushNotificationConfigParams, Task, TaskIdParams, TaskQueryParams, PushNotificationConfig, AgentCard } from '../types.js';
import { A2AStreamEventData, SendMessageResult } from './client.js';
import { ClientCallContext } from './context.js';
import { CallInterceptor } from './interceptors.js';
import { ServiceParameters } from './service-parameters.js';
import { Transport } from './transports/transport.js';
export interface ClientConfig {
    /**
     * Whether client prefers to poll for task updates instead of blocking until a terminal state is reached.
     * If set to true, non-streaming send message result might be a Message or a Task in any (including non-terminal) state.
     * Callers are responsible for running the polling loop. This configuration does not apply to streaming requests.
     */
    polling?: boolean;
    /**
     * Specifies the default list of accepted media types to apply for all "send message" calls.
     */
    acceptedOutputModes?: string[];
    /**
     * Specifies the default push notification configuration to apply for every Task.
     */
    pushNotificationConfig?: PushNotificationConfig;
    /**
     * Interceptors invoked for each request.
     */
    interceptors?: CallInterceptor[];
}
export interface RequestOptions {
    /**
     * Signal to abort request execution.
     */
    signal?: AbortSignal;
    /**
     * A key-value map for passing horizontally applicable context or parameters.
     * All parameters are passed to the server via underlying transports (e.g. In JsonRPC via Headers).
     */
    serviceParameters?: ServiceParameters;
    /**
     * Arbitrary data available to interceptors and transport implementation.
     */
    context?: ClientCallContext;
}
export declare class Client {
    readonly transport: Transport;
    private agentCard;
    readonly config?: ClientConfig;
    constructor(transport: Transport, agentCard: AgentCard, config?: ClientConfig);
    /**
     * If the current agent card supports the extended feature, it will try to fetch the extended agent card from the server,
     * Otherwise it will return the current agent card value.
     */
    getAgentCard(options?: RequestOptions): Promise<AgentCard>;
    /**
     * Sends a message to an agent to initiate a new interaction or to continue an existing one.
     * Uses blocking mode by default.
     */
    sendMessage(params: MessageSendParams, options?: RequestOptions): Promise<SendMessageResult>;
    /**
     * Sends a message to an agent to initiate/continue a task AND subscribes the client to real-time updates for that task.
     * Performs fallback to non-streaming if not supported by the agent.
     */
    sendMessageStream(params: MessageSendParams, options?: RequestOptions): AsyncGenerator<A2AStreamEventData, void, undefined>;
    /**
     * Sets or updates the push notification configuration for a specified task.
     * Requires the server to have AgentCard.capabilities.pushNotifications: true.
     */
    setTaskPushNotificationConfig(params: TaskPushNotificationConfig, options?: RequestOptions): Promise<TaskPushNotificationConfig>;
    /**
     * Retrieves the current push notification configuration for a specified task.
     * Requires the server to have AgentCard.capabilities.pushNotifications: true.
     */
    getTaskPushNotificationConfig(params: TaskIdParams, options?: RequestOptions): Promise<TaskPushNotificationConfig>;
    /**
     * Retrieves the associated push notification configurations for a specified task.
     * Requires the server to have AgentCard.capabilities.pushNotifications: true.
     */
    listTaskPushNotificationConfig(params: ListTaskPushNotificationConfigParams, options?: RequestOptions): Promise<TaskPushNotificationConfig[]>;
    /**
     * Deletes an associated push notification configuration for a task.
     */
    deleteTaskPushNotificationConfig(params: DeleteTaskPushNotificationConfigParams, options?: RequestOptions): Promise<void>;
    /**
     * Retrieves the current state (including status, artifacts, and optionally history) of a previously initiated task.
     */
    getTask(params: TaskQueryParams, options?: RequestOptions): Promise<Task>;
    /**
     * Requests the cancellation of an ongoing task. The server will attempt to cancel the task,
     * but success is not guaranteed (e.g., the task might have already completed or failed, or cancellation might not be supported at its current stage).
     */
    cancelTask(params: TaskIdParams, options?: RequestOptions): Promise<Task>;
    /**
     * Allows a client to reconnect to an updates stream for an ongoing task after a previous connection was interrupted.
     */
    resubscribeTask(params: TaskIdParams, options?: RequestOptions): AsyncGenerator<A2AStreamEventData, void, undefined>;
    private applyClientConfig;
    private executeWithInterceptors;
    private interceptBefore;
    private interceptAfter;
}
//# sourceMappingURL=multitransport-client.d.ts.map