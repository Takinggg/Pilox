import { Message, AgentCard, Task, MessageSendParams, TaskStatusUpdateEvent, TaskArtifactUpdateEvent, TaskQueryParams, TaskIdParams, TaskPushNotificationConfig, DeleteTaskPushNotificationConfigParams, GetTaskPushNotificationConfigParams, ListTaskPushNotificationConfigParams } from '../../types.js';
import { AgentExecutor } from '../agent_execution/agent_executor.js';
import { ExecutionEventBusManager } from '../events/execution_event_bus_manager.js';
import { TaskStore } from '../store.js';
import { A2ARequestHandler } from './a2a_request_handler.js';
import { PushNotificationStore } from '../push_notification/push_notification_store.js';
import { PushNotificationSender } from '../push_notification/push_notification_sender.js';
import { ServerCallContext } from '../context.js';
export declare class DefaultRequestHandler implements A2ARequestHandler {
    private readonly agentCard;
    private readonly taskStore;
    private readonly agentExecutor;
    private readonly eventBusManager;
    private readonly pushNotificationStore?;
    private readonly pushNotificationSender?;
    private readonly extendedAgentCardProvider?;
    constructor(agentCard: AgentCard, taskStore: TaskStore, agentExecutor: AgentExecutor, eventBusManager?: ExecutionEventBusManager, pushNotificationStore?: PushNotificationStore, pushNotificationSender?: PushNotificationSender, extendedAgentCardProvider?: AgentCard | ExtendedAgentCardProvider);
    getAgentCard(): Promise<AgentCard>;
    getAuthenticatedExtendedAgentCard(context?: ServerCallContext): Promise<AgentCard>;
    private _createRequestContext;
    private _processEvents;
    sendMessage(params: MessageSendParams, context?: ServerCallContext): Promise<Message | Task>;
    sendMessageStream(params: MessageSendParams, context?: ServerCallContext): AsyncGenerator<Message | Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent, void, undefined>;
    getTask(params: TaskQueryParams, context?: ServerCallContext): Promise<Task>;
    cancelTask(params: TaskIdParams, context?: ServerCallContext): Promise<Task>;
    setTaskPushNotificationConfig(params: TaskPushNotificationConfig, context?: ServerCallContext): Promise<TaskPushNotificationConfig>;
    getTaskPushNotificationConfig(params: TaskIdParams | GetTaskPushNotificationConfigParams, context?: ServerCallContext): Promise<TaskPushNotificationConfig>;
    listTaskPushNotificationConfigs(params: ListTaskPushNotificationConfigParams, context?: ServerCallContext): Promise<TaskPushNotificationConfig[]>;
    deleteTaskPushNotificationConfig(params: DeleteTaskPushNotificationConfigParams, context?: ServerCallContext): Promise<void>;
    resubscribe(params: TaskIdParams, context?: ServerCallContext): AsyncGenerator<Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent, void, undefined>;
    private _sendPushNotificationIfNeeded;
    private _handleProcessingError;
}
export type ExtendedAgentCardProvider = (context?: ServerCallContext) => Promise<AgentCard>;
//# sourceMappingURL=default_request_handler.d.ts.map