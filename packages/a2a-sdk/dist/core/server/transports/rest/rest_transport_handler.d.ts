/**
 * HTTP+JSON (REST) Transport Handler
 *
 * Accepts both snake_case (REST) and camelCase (internal) input.
 * Returns camelCase (internal types).
 */
import { A2AError } from '../../error.js';
import { A2ARequestHandler } from '../../request_handler/a2a_request_handler.js';
import { ServerCallContext } from '../../context.js';
import { Message, Task, TaskStatusUpdateEvent, TaskArtifactUpdateEvent, MessageSendParams, TaskPushNotificationConfig, AgentCard } from '../../../types.js';
/**
 * HTTP status codes used in REST responses.
 */
export declare const HTTP_STATUS: {
    readonly OK: 200;
    readonly CREATED: 201;
    readonly ACCEPTED: 202;
    readonly NO_CONTENT: 204;
    readonly BAD_REQUEST: 400;
    readonly UNAUTHORIZED: 401;
    readonly NOT_FOUND: 404;
    readonly CONFLICT: 409;
    readonly INTERNAL_SERVER_ERROR: 500;
    readonly NOT_IMPLEMENTED: 501;
};
/**
 * Maps A2A error codes to appropriate HTTP status codes.
 *
 * @param errorCode - A2A error code (e.g., -32700, -32600, -32602, etc.)
 * @returns Corresponding HTTP status code
 *
 * @example
 * mapErrorToStatus(-32602) // returns 400 (Bad Request)
 * mapErrorToStatus(-32001) // returns 404 (Not Found)
 */
export declare function mapErrorToStatus(errorCode: number): number;
/**
 * Converts an A2AError to HTTP+JSON transport format.
 * This conversion is private to the HTTP transport layer - errors are currently
 * tied to JSON-RPC format in A2AError, but for HTTP transport we need a simpler
 * format without the JSON-RPC wrapper.
 *
 * @param error - The A2AError to convert
 * @returns Error object with code, message, and optional data
 */
export declare function toHTTPError(error: A2AError): {
    code: number;
    message: string;
    data?: Record<string, unknown>;
};
/**
 * Handles REST transport layer, routing requests to A2ARequestHandler.
 * Performs type conversion, validation, and capability checks.
 * Similar to JsonRpcTransportHandler but for HTTP+JSON (REST) protocol.
 *
 * Accepts both snake_case and camelCase inputs.
 * Outputs camelCase for spec compliance.
 */
export declare class RestTransportHandler {
    private requestHandler;
    constructor(requestHandler: A2ARequestHandler);
    /**
     * Gets the agent card (for capability checks).
     */
    getAgentCard(): Promise<AgentCard>;
    /**
     * Gets the authenticated extended agent card.
     */
    getAuthenticatedExtendedAgentCard(context: ServerCallContext): Promise<AgentCard>;
    /**
     * Validate MessageSendParams.
     */
    private validateMessageSendParams;
    /**
     * Sends a message to the agent.
     */
    sendMessage(params: MessageSendParams, context: ServerCallContext): Promise<Message | Task>;
    /**
     * Sends a message with streaming response.
     * @throws {A2AError} UnsupportedOperation if streaming not supported
     */
    sendMessageStream(params: MessageSendParams, context: ServerCallContext): Promise<AsyncGenerator<Message | Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent, void, undefined>>;
    /**
     * Gets a task by ID.
     * Validates historyLength parameter if provided.
     */
    getTask(taskId: string, context: ServerCallContext, historyLength?: unknown): Promise<Task>;
    /**
     * Cancels a task.
     */
    cancelTask(taskId: string, context: ServerCallContext): Promise<Task>;
    /**
     * Resubscribes to task updates.
     * Returns camelCase stream of task updates.
     * @throws {A2AError} UnsupportedOperation if streaming not supported
     */
    resubscribe(taskId: string, context: ServerCallContext): Promise<AsyncGenerator<Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent, void, undefined>>;
    /**
     * Sets a push notification configuration.
     * @throws {A2AError} PushNotificationNotSupported if push notifications not supported
     */
    setTaskPushNotificationConfig(config: TaskPushNotificationConfig, context: ServerCallContext): Promise<TaskPushNotificationConfig>;
    /**
     * Lists all push notification configurations for a task.
     */
    listTaskPushNotificationConfigs(taskId: string, context: ServerCallContext): Promise<TaskPushNotificationConfig[]>;
    /**
     * Gets a specific push notification configuration.
     */
    getTaskPushNotificationConfig(taskId: string, configId: string, context: ServerCallContext): Promise<TaskPushNotificationConfig>;
    /**
     * Deletes a push notification configuration.
     */
    deleteTaskPushNotificationConfig(taskId: string, configId: string, context: ServerCallContext): Promise<void>;
    /**
     * Static map of capability to error for missing capabilities.
     */
    private static readonly CAPABILITY_ERRORS;
    /**
     * Validates that the agent supports a required capability.
     * @throws {A2AError} UnsupportedOperation for streaming, PushNotificationNotSupported for push notifications
     */
    private requireCapability;
    /**
     * Parses and validates historyLength query parameter.
     */
    private parseHistoryLength;
}
//# sourceMappingURL=rest_transport_handler.d.ts.map