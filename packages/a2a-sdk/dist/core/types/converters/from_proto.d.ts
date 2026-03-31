import { CancelTaskRequest, GetTaskPushNotificationConfigRequest, ListTaskPushNotificationConfigRequest, GetTaskRequest, CreateTaskPushNotificationConfigRequest, DeleteTaskPushNotificationConfigRequest, Message, Role, SendMessageConfiguration, PushNotificationConfig, AuthenticationInfo, SendMessageRequest, Part, SendMessageResponse, Task, TaskStatus, TaskState, Artifact, TaskPushNotificationConfig, ListTaskPushNotificationConfigResponse, AgentCard, Security, SecurityScheme, AgentSkill, AgentCardSignature, TaskStatusUpdateEvent, TaskArtifactUpdateEvent, OAuthFlows, StreamResponse, AgentInterface, AgentProvider, AgentCapabilities, AgentExtension } from '../pb/a2a_types.js';
import * as types from '../../types.js';
/**
 * Converts proto types to internal types.
 */
export declare class FromProto {
    static taskQueryParams(request: GetTaskRequest): types.TaskQueryParams;
    static taskIdParams(request: CancelTaskRequest): types.TaskIdParams;
    static getTaskPushNotificationConfigParams(request: GetTaskPushNotificationConfigRequest): types.GetTaskPushNotificationConfigParams;
    static listTaskPushNotificationConfigParams(request: ListTaskPushNotificationConfigRequest): types.ListTaskPushNotificationConfigParams;
    static createTaskPushNotificationConfig(request: CreateTaskPushNotificationConfigRequest): types.TaskPushNotificationConfig;
    static deleteTaskPushNotificationConfigParams(request: DeleteTaskPushNotificationConfigRequest): types.DeleteTaskPushNotificationConfigParams;
    static message(message: Message): types.Message | undefined;
    static role(role: Role): 'agent' | 'user';
    static messageSendConfiguration(configuration: SendMessageConfiguration): types.MessageSendConfiguration | undefined;
    static pushNotificationConfig(config: PushNotificationConfig): types.PushNotificationConfig | undefined;
    static pushNotificationAuthenticationInfo(authInfo: AuthenticationInfo): types.PushNotificationAuthenticationInfo | undefined;
    static part(part: Part): types.Part;
    static messageSendParams(request: SendMessageRequest): types.MessageSendParams;
    static sendMessageResult(response: SendMessageResponse): types.Task | types.Message;
    static task(task: Task): types.Task;
    static taskStatus(status: TaskStatus): types.TaskStatus;
    static taskState(state: TaskState): types.TaskState;
    static artifact(artifact: Artifact): types.Artifact;
    static taskPushNotificationConfig(request: TaskPushNotificationConfig): types.TaskPushNotificationConfig;
    static listTaskPushNotificationConfig(request: ListTaskPushNotificationConfigResponse): types.TaskPushNotificationConfig[];
    static agentCard(agentCard: AgentCard): types.AgentCard;
    static agentCapabilities(capabilities: AgentCapabilities): types.AgentCapabilities1;
    static agentExtension(extension: AgentExtension): types.AgentExtension;
    static agentInterface(intf: AgentInterface): types.AgentInterface;
    static agentProvider(provider: AgentProvider): types.AgentProvider;
    static security(security: Security): {
        [k: string]: string[];
    };
    static securityScheme(securitySchemes: SecurityScheme): types.SecurityScheme;
    static oauthFlows(flows: OAuthFlows): types.OAuthFlows;
    static skills(skill: AgentSkill): types.AgentSkill;
    static agentCardSignature(signatures: AgentCardSignature): types.AgentCardSignature;
    static taskStatusUpdateEvent(event: TaskStatusUpdateEvent): types.TaskStatusUpdateEvent;
    static taskArtifactUpdateEvent(event: TaskArtifactUpdateEvent): types.TaskArtifactUpdateEvent;
    static messageStreamResult(event: StreamResponse): types.Message | types.Task | types.TaskStatusUpdateEvent | types.TaskArtifactUpdateEvent;
}
//# sourceMappingURL=from_proto.d.ts.map