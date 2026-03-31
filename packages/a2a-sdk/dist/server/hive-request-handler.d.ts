import type { Message, AgentCard, Task, MessageSendParams, TaskStatusUpdateEvent, TaskArtifactUpdateEvent, TaskQueryParams, TaskIdParams, TaskPushNotificationConfig, GetTaskPushNotificationConfigParams, ListTaskPushNotificationConfigParams, DeleteTaskPushNotificationConfigParams } from '../core/types.js';
import type { A2ARequestHandler } from '../core/server/request_handler/a2a_request_handler.js';
import type { ServerCallContext } from '../core/server/context.js';
import type { Middleware, ServerMiddlewareContext } from '../middleware/types.js';
/**
 * PiloxRequestHandler wraps the upstream DefaultRequestHandler
 * and injects the middleware pipeline around every A2A method call.
 */
export declare class PiloxRequestHandler implements A2ARequestHandler {
    private readonly upstream;
    private readonly agentCard;
    private readonly pipeline;
    constructor(upstream: A2ARequestHandler, agentCard: AgentCard, middlewares: Middleware<ServerMiddlewareContext>[]);
    getAgentCard(): Promise<AgentCard>;
    getAuthenticatedExtendedAgentCard(context?: ServerCallContext): Promise<AgentCard>;
    sendMessage(params: MessageSendParams, context?: ServerCallContext): Promise<Message | Task>;
    sendMessageStream(params: MessageSendParams, context?: ServerCallContext): AsyncGenerator<Message | Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent, void, undefined>;
    getTask(params: TaskQueryParams, context?: ServerCallContext): Promise<Task>;
    cancelTask(params: TaskIdParams, context?: ServerCallContext): Promise<Task>;
    setTaskPushNotificationConfig(params: TaskPushNotificationConfig, context?: ServerCallContext): Promise<TaskPushNotificationConfig>;
    getTaskPushNotificationConfig(params: TaskIdParams | GetTaskPushNotificationConfigParams, context?: ServerCallContext): Promise<TaskPushNotificationConfig>;
    listTaskPushNotificationConfigs(params: ListTaskPushNotificationConfigParams, context?: ServerCallContext): Promise<TaskPushNotificationConfig[]>;
    deleteTaskPushNotificationConfig(params: DeleteTaskPushNotificationConfigParams, context?: ServerCallContext): Promise<void>;
    resubscribe(params: TaskIdParams, context?: ServerCallContext): AsyncGenerator<Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent, void, undefined>;
}
//# sourceMappingURL=pilox-request-handler.d.ts.map