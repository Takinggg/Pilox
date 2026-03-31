import * as types from '../../types.js';
import { AgentCard, AgentCardSignature, AgentCapabilities, AgentExtension, AgentInterface, AgentProvider, Artifact, AuthenticationInfo, Message, OAuthFlows, Part, PushNotificationConfig, Role, Security, SecurityScheme, SendMessageResponse, StreamResponse, Task, TaskArtifactUpdateEvent, TaskPushNotificationConfig, TaskState, TaskStatus, TaskStatusUpdateEvent, ListTaskPushNotificationConfigResponse, AgentSkill, SendMessageRequest, SendMessageConfiguration, GetTaskPushNotificationConfigRequest, ListTaskPushNotificationConfigRequest, DeleteTaskPushNotificationConfigRequest, GetTaskRequest, CancelTaskRequest, TaskSubscriptionRequest, CreateTaskPushNotificationConfigRequest, GetAgentCardRequest } from '../pb/a2a_types.js';
export declare class ToProto {
    static agentCard(agentCard: types.AgentCard): AgentCard;
    static agentCardSignature(signatures: types.AgentCardSignature): AgentCardSignature;
    static agentSkill(skill: types.AgentSkill): AgentSkill;
    static security(security: {
        [k: string]: string[];
    }): Security;
    static securityScheme(scheme: types.SecurityScheme): SecurityScheme;
    static oauthFlows(flows: types.OAuthFlows): OAuthFlows;
    static agentInterface(agentInterface: types.AgentInterface): AgentInterface;
    static agentProvider(agentProvider: types.AgentProvider): AgentProvider;
    static agentCapabilities(capabilities: types.AgentCapabilities): AgentCapabilities;
    static agentExtension(extension: types.AgentExtension): AgentExtension;
    static listTaskPushNotificationConfig(config: types.TaskPushNotificationConfig[]): ListTaskPushNotificationConfigResponse;
    static getTaskPushNotificationConfigParams(config: types.GetTaskPushNotificationConfigParams): GetTaskPushNotificationConfigRequest;
    static listTaskPushNotificationConfigParams(config: types.ListTaskPushNotificationConfigParams): ListTaskPushNotificationConfigRequest;
    static deleteTaskPushNotificationConfigParams(config: types.DeleteTaskPushNotificationConfigParams): DeleteTaskPushNotificationConfigRequest;
    static taskPushNotificationConfig(config: types.TaskPushNotificationConfig): TaskPushNotificationConfig;
    static taskPushNotificationConfigCreate(config: types.TaskPushNotificationConfig): CreateTaskPushNotificationConfigRequest;
    static pushNotificationConfig(config: types.PushNotificationConfig): PushNotificationConfig;
    static pushNotificationAuthenticationInfo(authInfo: types.PushNotificationAuthenticationInfo): AuthenticationInfo | undefined;
    static messageStreamResult(event: types.Message | types.Task | types.TaskStatusUpdateEvent | types.TaskArtifactUpdateEvent): StreamResponse;
    static taskStatusUpdateEvent(event: types.TaskStatusUpdateEvent): TaskStatusUpdateEvent;
    static taskArtifactUpdateEvent(event: types.TaskArtifactUpdateEvent): TaskArtifactUpdateEvent;
    static messageSendResult(params: types.Message | types.Task): SendMessageResponse;
    static message(message: types.Message): Message | undefined;
    static role(role: string): Role;
    static task(task: types.Task): Task;
    static taskStatus(status: types.TaskStatus): TaskStatus;
    static artifact(artifact: types.Artifact): Artifact;
    static taskState(state: types.TaskState): TaskState;
    static part(part: types.Part): Part;
    static messageSendParams(params: types.MessageSendParams): SendMessageRequest;
    static configuration(configuration: types.MessageSendConfiguration): SendMessageConfiguration;
    static taskQueryParams(params: types.TaskQueryParams): GetTaskRequest;
    static cancelTaskRequest(params: types.TaskIdParams): CancelTaskRequest;
    static taskIdParams(params: types.TaskIdParams): TaskSubscriptionRequest;
    static getAgentCardRequest(): GetAgentCardRequest;
}
//# sourceMappingURL=to_proto.d.ts.map