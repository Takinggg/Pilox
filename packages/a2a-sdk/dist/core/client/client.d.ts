import { AgentCard, JSONRPCResponse, MessageSendParams, SendMessageResponse, TaskQueryParams, GetTaskResponse, TaskIdParams, CancelTaskResponse, TaskPushNotificationConfig, // Renamed from PushNotificationConfigParams for direct schema alignment
SetTaskPushNotificationConfigResponse, GetTaskPushNotificationConfigResponse, ListTaskPushNotificationConfigParams, ListTaskPushNotificationConfigResponse, DeleteTaskPushNotificationConfigResponse, DeleteTaskPushNotificationConfigParams, Message, Task, TaskArtifactUpdateEvent, TaskStatusUpdateEvent } from '../types.js';
export type A2AStreamEventData = Message | Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent;
export type SendMessageResult = Message | Task;
export interface A2AClientOptions {
    agentCardPath?: string;
    fetchImpl?: typeof fetch;
}
/**
 * A2AClient is a TypeScript HTTP client for interacting with A2A-compliant agents.
 * Only JSON-RPC transport is supported.
 * @deprecated Use {@link ClientFactory}
 */
export declare class A2AClient {
    private static emptyOptions?;
    private readonly agentCardPromise;
    private readonly customFetchImpl?;
    private serviceEndpointUrl?;
    private transport?;
    private requestIdCounter;
    /**
     * Constructs an A2AClient instance from an AgentCard.
     * @param agentCard The AgentCard object.
     * @param options Optional. The options for the A2AClient including the fetch/auth implementation.
     */
    constructor(agentCard: AgentCard | string, options?: A2AClientOptions);
    /**
     * Dynamically resolves the fetch implementation to use for requests.
     * Prefers a custom implementation if provided, otherwise falls back to the global fetch.
     * @returns The fetch implementation.
     * @param args Arguments to pass to the fetch implementation.
     * @throws If no fetch implementation is available.
     */
    private _fetch;
    /**
     * Creates an A2AClient instance by fetching the AgentCard from a URL then constructing the A2AClient.
     * @param agentCardUrl The URL of the agent card.
     * @param options Optional. The options for the A2AClient including the fetch/auth implementation.
     * @returns A Promise that resolves to a new A2AClient instance.
     */
    static fromCardUrl(agentCardUrl: string, options?: A2AClientOptions): Promise<A2AClient>;
    /**
     * Sends a message to the agent.
     * The behavior (blocking/non-blocking) and push notification configuration
     * are specified within the `params.configuration` object.
     * Optionally, `params.message.contextId` or `params.message.taskId` can be provided.
     * @param params The parameters for sending the message, including the message content and configuration.
     * @returns A Promise resolving to SendMessageResponse, which can be a Message, Task, or an error.
     */
    sendMessage(params: MessageSendParams): Promise<SendMessageResponse>;
    /**
     * Sends a message to the agent and streams back responses using Server-Sent Events (SSE).
     * Push notification configuration can be specified in `params.configuration`.
     * Optionally, `params.message.contextId` or `params.message.taskId` can be provided.
     * Requires the agent to support streaming (`capabilities.streaming: true` in AgentCard).
     * @param params The parameters for sending the message.
     * @returns An AsyncGenerator yielding A2AStreamEventData (Message, Task, TaskStatusUpdateEvent, or TaskArtifactUpdateEvent).
     * The generator throws an error if streaming is not supported or if an HTTP/SSE error occurs.
     */
    sendMessageStream(params: MessageSendParams): AsyncGenerator<A2AStreamEventData, void, undefined>;
    /**
     * Sets or updates the push notification configuration for a given task.
     * Requires the agent to support push notifications (`capabilities.pushNotifications: true` in AgentCard).
     * @param params Parameters containing the taskId and the TaskPushNotificationConfig.
     * @returns A Promise resolving to SetTaskPushNotificationConfigResponse.
     */
    setTaskPushNotificationConfig(params: TaskPushNotificationConfig): Promise<SetTaskPushNotificationConfigResponse>;
    /**
     * Gets the push notification configuration for a given task.
     * @param params Parameters containing the taskId.
     * @returns A Promise resolving to GetTaskPushNotificationConfigResponse.
     */
    getTaskPushNotificationConfig(params: TaskIdParams): Promise<GetTaskPushNotificationConfigResponse>;
    /**
     * Lists the push notification configurations for a given task.
     * @param params Parameters containing the taskId.
     * @returns A Promise resolving to ListTaskPushNotificationConfigResponse.
     */
    listTaskPushNotificationConfig(params: ListTaskPushNotificationConfigParams): Promise<ListTaskPushNotificationConfigResponse>;
    /**
     * Deletes the push notification configuration for a given task.
     * @param params Parameters containing the taskId and push notification configuration ID.
     * @returns A Promise resolving to DeleteTaskPushNotificationConfigResponse.
     */
    deleteTaskPushNotificationConfig(params: DeleteTaskPushNotificationConfigParams): Promise<DeleteTaskPushNotificationConfigResponse>;
    /**
     * Retrieves a task by its ID.
     * @param params Parameters containing the taskId and optional historyLength.
     * @returns A Promise resolving to GetTaskResponse, which contains the Task object or an error.
     */
    getTask(params: TaskQueryParams): Promise<GetTaskResponse>;
    /**
     * Cancels a task by its ID.
     * @param params Parameters containing the taskId.
     * @returns A Promise resolving to CancelTaskResponse, which contains the updated Task object or an error.
     */
    cancelTask(params: TaskIdParams): Promise<CancelTaskResponse>;
    /**
     * @template TExtensionParams The type of parameters for the custom extension method.
     * @template TExtensionResponse The type of response expected from the custom extension method.
     * This should extend JSONRPCResponse. This ensures the extension response is still a valid A2A response.
     * @param method Custom JSON-RPC method defined in the AgentCard's extensions.
     * @param params Extension paramters defined in the AgentCard's extensions.
     * @returns A Promise that resolves to the RPC response.
     */
    callExtensionMethod<TExtensionParams, TExtensionResponse extends JSONRPCResponse>(method: string, params: TExtensionParams): Promise<TExtensionResponse>;
    /**
     * Resubscribes to a task's event stream using Server-Sent Events (SSE).
     * This is used if a previous SSE connection for an active task was broken.
     * Requires the agent to support streaming (`capabilities.streaming: true` in AgentCard).
     * @param params Parameters containing the taskId.
     * @returns An AsyncGenerator yielding A2AStreamEventData (Message, Task, TaskStatusUpdateEvent, or TaskArtifactUpdateEvent).
     */
    resubscribeTask(params: TaskIdParams): AsyncGenerator<A2AStreamEventData, void, undefined>;
    private _getOrCreateTransport;
    /**
     * Fetches the Agent Card from the agent's well-known URI and caches its service endpoint URL.
     * This method is called by the constructor.
     * @param agentBaseUrl The base URL of the A2A agent (e.g., https://agent.example.com)
     * @param agentCardPath path to the agent card, defaults to .well-known/agent-card.json
     * @returns A Promise that resolves to the AgentCard.
     */
    private _fetchAndCacheAgentCard;
    /**
     * Retrieves the Agent Card.
     * If an `agentBaseUrl` is provided, it fetches the card from that specific URL.
     * Otherwise, it returns the card fetched and cached during client construction.
     * @param agentBaseUrl Optional. The base URL of the agent to fetch the card from.
     * @param agentCardPath path to the agent card, defaults to .well-known/agent-card.json
     * If provided, this will fetch a new card, not use the cached one from the constructor's URL.
     * @returns A Promise that resolves to the AgentCard.
     */
    getAgentCard(agentBaseUrl?: string, agentCardPath?: string): Promise<AgentCard>;
    /**
     * Determines the agent card URL based on the agent URL.
     * @param agentBaseUrl The agent URL.
     * @param agentCardPath Optional relative path to the agent card, defaults to .well-known/agent-card.json
     */
    private resolveAgentCardUrl;
    /**
     * Gets the RPC service endpoint URL. Ensures the agent card has been fetched first.
     * @returns A Promise that resolves to the service endpoint URL string.
     */
    private _getServiceEndpoint;
    private invokeJsonRpc;
}
//# sourceMappingURL=client.d.ts.map