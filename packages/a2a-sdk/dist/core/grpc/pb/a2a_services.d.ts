import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import { type CallOptions, ChannelCredentials, Client, type ClientOptions, type ClientReadableStream, type ClientUnaryCall, type handleServerStreamingCall, type handleUnaryCall, Metadata, type ServiceError, type UntypedServiceImplementation } from "@grpc/grpc-js";
import { Empty } from "./google/protobuf/empty.js";
export declare const protobufPackage = "a2a.v1";
import * as pb from "../../types/pb/a2a_types.js";
export type SendMessageConfiguration = pb.SendMessageConfiguration;
export type Task = pb.Task;
export type TaskStatus = pb.TaskStatus;
export type Part = pb.Part;
export type FilePart = pb.FilePart;
export type DataPart = pb.DataPart;
export type Message = pb.Message;
export type Artifact = pb.Artifact;
export type TaskStatusUpdateEvent = pb.TaskStatusUpdateEvent;
export type TaskArtifactUpdateEvent = pb.TaskArtifactUpdateEvent;
export type PushNotificationConfig = pb.PushNotificationConfig;
export type AuthenticationInfo = pb.AuthenticationInfo;
export type AgentInterface = pb.AgentInterface;
export type AgentCard = pb.AgentCard;
export type AgentCard_SecuritySchemesEntry = pb.AgentCard_SecuritySchemesEntry;
export type AgentProvider = pb.AgentProvider;
export type AgentCapabilities = pb.AgentCapabilities;
export type AgentExtension = pb.AgentExtension;
export type AgentSkill = pb.AgentSkill;
export type AgentCardSignature = pb.AgentCardSignature;
export type TaskPushNotificationConfig = pb.TaskPushNotificationConfig;
export type StringList = pb.StringList;
export type Security = pb.Security;
export type Security_SchemesEntry = pb.Security_SchemesEntry;
export type SecurityScheme = pb.SecurityScheme;
export type APIKeySecurityScheme = pb.APIKeySecurityScheme;
export type HTTPAuthSecurityScheme = pb.HTTPAuthSecurityScheme;
export type OAuth2SecurityScheme = pb.OAuth2SecurityScheme;
export type OpenIdConnectSecurityScheme = pb.OpenIdConnectSecurityScheme;
export type MutualTlsSecurityScheme = pb.MutualTlsSecurityScheme;
export type OAuthFlows = pb.OAuthFlows;
export type AuthorizationCodeOAuthFlow = pb.AuthorizationCodeOAuthFlow;
export type AuthorizationCodeOAuthFlow_ScopesEntry = pb.AuthorizationCodeOAuthFlow_ScopesEntry;
export type ClientCredentialsOAuthFlow = pb.ClientCredentialsOAuthFlow;
export type ClientCredentialsOAuthFlow_ScopesEntry = pb.ClientCredentialsOAuthFlow_ScopesEntry;
export type ImplicitOAuthFlow = pb.ImplicitOAuthFlow;
export type ImplicitOAuthFlow_ScopesEntry = pb.ImplicitOAuthFlow_ScopesEntry;
export type PasswordOAuthFlow = pb.PasswordOAuthFlow;
export type PasswordOAuthFlow_ScopesEntry = pb.PasswordOAuthFlow_ScopesEntry;
export type SendMessageRequest = pb.SendMessageRequest;
export type GetTaskRequest = pb.GetTaskRequest;
export type CancelTaskRequest = pb.CancelTaskRequest;
export type GetTaskPushNotificationConfigRequest = pb.GetTaskPushNotificationConfigRequest;
export type DeleteTaskPushNotificationConfigRequest = pb.DeleteTaskPushNotificationConfigRequest;
export type CreateTaskPushNotificationConfigRequest = pb.CreateTaskPushNotificationConfigRequest;
export type TaskSubscriptionRequest = pb.TaskSubscriptionRequest;
export type ListTaskPushNotificationConfigRequest = pb.ListTaskPushNotificationConfigRequest;
export type GetAgentCardRequest = pb.GetAgentCardRequest;
export type SendMessageResponse = pb.SendMessageResponse;
export type StreamResponse = pb.StreamResponse;
export type ListTaskPushNotificationConfigResponse = pb.ListTaskPushNotificationConfigResponse;
export declare const SendMessageConfiguration: MessageFns<SendMessageConfiguration>;
export declare const Task: MessageFns<Task>;
export declare const TaskStatus: MessageFns<TaskStatus>;
export declare const Part: MessageFns<Part>;
export declare const FilePart: MessageFns<FilePart>;
export declare const DataPart: MessageFns<DataPart>;
export declare const Message: MessageFns<Message>;
export declare const Artifact: MessageFns<Artifact>;
export declare const TaskStatusUpdateEvent: MessageFns<TaskStatusUpdateEvent>;
export declare const TaskArtifactUpdateEvent: MessageFns<TaskArtifactUpdateEvent>;
export declare const PushNotificationConfig: MessageFns<PushNotificationConfig>;
export declare const AuthenticationInfo: MessageFns<AuthenticationInfo>;
export declare const AgentInterface: MessageFns<AgentInterface>;
export declare const AgentCard: MessageFns<AgentCard>;
export declare const AgentCard_SecuritySchemesEntry: MessageFns<AgentCard_SecuritySchemesEntry>;
export declare const AgentProvider: MessageFns<AgentProvider>;
export declare const AgentCapabilities: MessageFns<AgentCapabilities>;
export declare const AgentExtension: MessageFns<AgentExtension>;
export declare const AgentSkill: MessageFns<AgentSkill>;
export declare const AgentCardSignature: MessageFns<AgentCardSignature>;
export declare const TaskPushNotificationConfig: MessageFns<TaskPushNotificationConfig>;
export declare const StringList: MessageFns<StringList>;
export declare const Security: MessageFns<Security>;
export declare const Security_SchemesEntry: MessageFns<Security_SchemesEntry>;
export declare const SecurityScheme: MessageFns<SecurityScheme>;
export declare const APIKeySecurityScheme: MessageFns<APIKeySecurityScheme>;
export declare const HTTPAuthSecurityScheme: MessageFns<HTTPAuthSecurityScheme>;
export declare const OAuth2SecurityScheme: MessageFns<OAuth2SecurityScheme>;
export declare const OpenIdConnectSecurityScheme: MessageFns<OpenIdConnectSecurityScheme>;
export declare const MutualTlsSecurityScheme: MessageFns<MutualTlsSecurityScheme>;
export declare const OAuthFlows: MessageFns<OAuthFlows>;
export declare const AuthorizationCodeOAuthFlow: MessageFns<AuthorizationCodeOAuthFlow>;
export declare const AuthorizationCodeOAuthFlow_ScopesEntry: MessageFns<AuthorizationCodeOAuthFlow_ScopesEntry>;
export declare const ClientCredentialsOAuthFlow: MessageFns<ClientCredentialsOAuthFlow>;
export declare const ClientCredentialsOAuthFlow_ScopesEntry: MessageFns<ClientCredentialsOAuthFlow_ScopesEntry>;
export declare const ImplicitOAuthFlow: MessageFns<ImplicitOAuthFlow>;
export declare const ImplicitOAuthFlow_ScopesEntry: MessageFns<ImplicitOAuthFlow_ScopesEntry>;
export declare const PasswordOAuthFlow: MessageFns<PasswordOAuthFlow>;
export declare const PasswordOAuthFlow_ScopesEntry: MessageFns<PasswordOAuthFlow_ScopesEntry>;
export declare const SendMessageRequest: MessageFns<SendMessageRequest>;
export declare const GetTaskRequest: MessageFns<GetTaskRequest>;
export declare const CancelTaskRequest: MessageFns<CancelTaskRequest>;
export declare const GetTaskPushNotificationConfigRequest: MessageFns<GetTaskPushNotificationConfigRequest>;
export declare const DeleteTaskPushNotificationConfigRequest: MessageFns<DeleteTaskPushNotificationConfigRequest>;
export declare const CreateTaskPushNotificationConfigRequest: MessageFns<CreateTaskPushNotificationConfigRequest>;
export declare const TaskSubscriptionRequest: MessageFns<TaskSubscriptionRequest>;
export declare const ListTaskPushNotificationConfigRequest: MessageFns<ListTaskPushNotificationConfigRequest>;
export declare const GetAgentCardRequest: MessageFns<GetAgentCardRequest>;
export declare const SendMessageResponse: MessageFns<SendMessageResponse>;
export declare const StreamResponse: MessageFns<StreamResponse>;
export declare const ListTaskPushNotificationConfigResponse: MessageFns<ListTaskPushNotificationConfigResponse>;
/**
 * A2AService defines the gRPC version of the A2A protocol. This has a slightly
 * different shape than the JSONRPC version to better conform to AIP-127,
 * where appropriate. The nouns are AgentCard, Message, Task and
 * TaskPushNotificationConfig.
 * - Messages are not a standard resource so there is no get/delete/update/list
 *   interface, only a send and stream custom methods.
 * - Tasks have a get interface and custom cancel and subscribe methods.
 * - TaskPushNotificationConfig are a resource whose parent is a task.
 *   They have get, list and create methods.
 * - AgentCard is a static resource with only a get method.
 * fields are not present as they don't comply with AIP rules, and the
 * optional history_length on the get task method is not present as it also
 * violates AIP-127 and AIP-131.
 */
export type A2AServiceService = typeof A2AServiceService;
export declare const A2AServiceService: {
    /**
     * Send a message to the agent. This is a blocking call that will return the
     * task once it is completed, or a LRO if requested.
     */
    readonly sendMessage: {
        readonly path: "/a2a.v1.A2AService/SendMessage";
        readonly requestStream: false;
        readonly responseStream: false;
        readonly requestSerialize: (value: SendMessageRequest) => Buffer<ArrayBuffer>;
        readonly requestDeserialize: (value: Buffer) => pb.SendMessageRequest;
        readonly responseSerialize: (value: SendMessageResponse) => Buffer<ArrayBuffer>;
        readonly responseDeserialize: (value: Buffer) => pb.SendMessageResponse;
    };
    /**
     * SendStreamingMessage is a streaming call that will return a stream of
     * task update events until the Task is in an interrupted or terminal state.
     */
    readonly sendStreamingMessage: {
        readonly path: "/a2a.v1.A2AService/SendStreamingMessage";
        readonly requestStream: false;
        readonly responseStream: true;
        readonly requestSerialize: (value: SendMessageRequest) => Buffer<ArrayBuffer>;
        readonly requestDeserialize: (value: Buffer) => pb.SendMessageRequest;
        readonly responseSerialize: (value: StreamResponse) => Buffer<ArrayBuffer>;
        readonly responseDeserialize: (value: Buffer) => pb.StreamResponse;
    };
    /** Get the current state of a task from the agent. */
    readonly getTask: {
        readonly path: "/a2a.v1.A2AService/GetTask";
        readonly requestStream: false;
        readonly responseStream: false;
        readonly requestSerialize: (value: GetTaskRequest) => Buffer<ArrayBuffer>;
        readonly requestDeserialize: (value: Buffer) => pb.GetTaskRequest;
        readonly responseSerialize: (value: Task) => Buffer<ArrayBuffer>;
        readonly responseDeserialize: (value: Buffer) => pb.Task;
    };
    /**
     * Cancel a task from the agent. If supported one should expect no
     * more task updates for the task.
     */
    readonly cancelTask: {
        readonly path: "/a2a.v1.A2AService/CancelTask";
        readonly requestStream: false;
        readonly responseStream: false;
        readonly requestSerialize: (value: CancelTaskRequest) => Buffer<ArrayBuffer>;
        readonly requestDeserialize: (value: Buffer) => pb.CancelTaskRequest;
        readonly responseSerialize: (value: Task) => Buffer<ArrayBuffer>;
        readonly responseDeserialize: (value: Buffer) => pb.Task;
    };
    /**
     * TaskSubscription is a streaming call that will return a stream of task
     * update events. This attaches the stream to an existing in process task.
     * If the task is complete the stream will return the completed task (like
     * GetTask) and close the stream.
     */
    readonly taskSubscription: {
        readonly path: "/a2a.v1.A2AService/TaskSubscription";
        readonly requestStream: false;
        readonly responseStream: true;
        readonly requestSerialize: (value: TaskSubscriptionRequest) => Buffer<ArrayBuffer>;
        readonly requestDeserialize: (value: Buffer) => pb.TaskSubscriptionRequest;
        readonly responseSerialize: (value: StreamResponse) => Buffer<ArrayBuffer>;
        readonly responseDeserialize: (value: Buffer) => pb.StreamResponse;
    };
    /** Set a push notification config for a task. */
    readonly createTaskPushNotificationConfig: {
        readonly path: "/a2a.v1.A2AService/CreateTaskPushNotificationConfig";
        readonly requestStream: false;
        readonly responseStream: false;
        readonly requestSerialize: (value: CreateTaskPushNotificationConfigRequest) => Buffer<ArrayBuffer>;
        readonly requestDeserialize: (value: Buffer) => pb.CreateTaskPushNotificationConfigRequest;
        readonly responseSerialize: (value: TaskPushNotificationConfig) => Buffer<ArrayBuffer>;
        readonly responseDeserialize: (value: Buffer) => pb.TaskPushNotificationConfig;
    };
    /** Get a push notification config for a task. */
    readonly getTaskPushNotificationConfig: {
        readonly path: "/a2a.v1.A2AService/GetTaskPushNotificationConfig";
        readonly requestStream: false;
        readonly responseStream: false;
        readonly requestSerialize: (value: GetTaskPushNotificationConfigRequest) => Buffer<ArrayBuffer>;
        readonly requestDeserialize: (value: Buffer) => pb.GetTaskPushNotificationConfigRequest;
        readonly responseSerialize: (value: TaskPushNotificationConfig) => Buffer<ArrayBuffer>;
        readonly responseDeserialize: (value: Buffer) => pb.TaskPushNotificationConfig;
    };
    /** Get a list of push notifications configured for a task. */
    readonly listTaskPushNotificationConfig: {
        readonly path: "/a2a.v1.A2AService/ListTaskPushNotificationConfig";
        readonly requestStream: false;
        readonly responseStream: false;
        readonly requestSerialize: (value: ListTaskPushNotificationConfigRequest) => Buffer<ArrayBuffer>;
        readonly requestDeserialize: (value: Buffer) => pb.ListTaskPushNotificationConfigRequest;
        readonly responseSerialize: (value: ListTaskPushNotificationConfigResponse) => Buffer<ArrayBuffer>;
        readonly responseDeserialize: (value: Buffer) => pb.ListTaskPushNotificationConfigResponse;
    };
    /** GetAgentCard returns the agent card for the agent. */
    readonly getAgentCard: {
        readonly path: "/a2a.v1.A2AService/GetAgentCard";
        readonly requestStream: false;
        readonly responseStream: false;
        readonly requestSerialize: (value: GetAgentCardRequest) => Buffer<ArrayBuffer>;
        readonly requestDeserialize: (value: Buffer) => pb.GetAgentCardRequest;
        readonly responseSerialize: (value: AgentCard) => Buffer<ArrayBuffer>;
        readonly responseDeserialize: (value: Buffer) => pb.AgentCard;
    };
    /** Delete a push notification config for a task. */
    readonly deleteTaskPushNotificationConfig: {
        readonly path: "/a2a.v1.A2AService/DeleteTaskPushNotificationConfig";
        readonly requestStream: false;
        readonly responseStream: false;
        readonly requestSerialize: (value: DeleteTaskPushNotificationConfigRequest) => Buffer<ArrayBuffer>;
        readonly requestDeserialize: (value: Buffer) => pb.DeleteTaskPushNotificationConfigRequest;
        readonly responseSerialize: (value: Empty) => Buffer<ArrayBuffer>;
        readonly responseDeserialize: (value: Buffer) => Empty;
    };
};
export interface A2AServiceServer extends UntypedServiceImplementation {
    /**
     * Send a message to the agent. This is a blocking call that will return the
     * task once it is completed, or a LRO if requested.
     */
    sendMessage: handleUnaryCall<SendMessageRequest, SendMessageResponse>;
    /**
     * SendStreamingMessage is a streaming call that will return a stream of
     * task update events until the Task is in an interrupted or terminal state.
     */
    sendStreamingMessage: handleServerStreamingCall<SendMessageRequest, StreamResponse>;
    /** Get the current state of a task from the agent. */
    getTask: handleUnaryCall<GetTaskRequest, Task>;
    /**
     * Cancel a task from the agent. If supported one should expect no
     * more task updates for the task.
     */
    cancelTask: handleUnaryCall<CancelTaskRequest, Task>;
    /**
     * TaskSubscription is a streaming call that will return a stream of task
     * update events. This attaches the stream to an existing in process task.
     * If the task is complete the stream will return the completed task (like
     * GetTask) and close the stream.
     */
    taskSubscription: handleServerStreamingCall<TaskSubscriptionRequest, StreamResponse>;
    /** Set a push notification config for a task. */
    createTaskPushNotificationConfig: handleUnaryCall<CreateTaskPushNotificationConfigRequest, TaskPushNotificationConfig>;
    /** Get a push notification config for a task. */
    getTaskPushNotificationConfig: handleUnaryCall<GetTaskPushNotificationConfigRequest, TaskPushNotificationConfig>;
    /** Get a list of push notifications configured for a task. */
    listTaskPushNotificationConfig: handleUnaryCall<ListTaskPushNotificationConfigRequest, ListTaskPushNotificationConfigResponse>;
    /** GetAgentCard returns the agent card for the agent. */
    getAgentCard: handleUnaryCall<GetAgentCardRequest, AgentCard>;
    /** Delete a push notification config for a task. */
    deleteTaskPushNotificationConfig: handleUnaryCall<DeleteTaskPushNotificationConfigRequest, Empty>;
}
export interface A2AServiceClient extends Client {
    /**
     * Send a message to the agent. This is a blocking call that will return the
     * task once it is completed, or a LRO if requested.
     */
    sendMessage(request: SendMessageRequest, callback: (error: ServiceError | null, response: SendMessageResponse) => void): ClientUnaryCall;
    sendMessage(request: SendMessageRequest, metadata: Metadata, callback: (error: ServiceError | null, response: SendMessageResponse) => void): ClientUnaryCall;
    sendMessage(request: SendMessageRequest, metadata: Metadata, options: Partial<CallOptions>, callback: (error: ServiceError | null, response: SendMessageResponse) => void): ClientUnaryCall;
    /**
     * SendStreamingMessage is a streaming call that will return a stream of
     * task update events until the Task is in an interrupted or terminal state.
     */
    sendStreamingMessage(request: SendMessageRequest, options?: Partial<CallOptions>): ClientReadableStream<StreamResponse>;
    sendStreamingMessage(request: SendMessageRequest, metadata?: Metadata, options?: Partial<CallOptions>): ClientReadableStream<StreamResponse>;
    /** Get the current state of a task from the agent. */
    getTask(request: GetTaskRequest, callback: (error: ServiceError | null, response: Task) => void): ClientUnaryCall;
    getTask(request: GetTaskRequest, metadata: Metadata, callback: (error: ServiceError | null, response: Task) => void): ClientUnaryCall;
    getTask(request: GetTaskRequest, metadata: Metadata, options: Partial<CallOptions>, callback: (error: ServiceError | null, response: Task) => void): ClientUnaryCall;
    /**
     * Cancel a task from the agent. If supported one should expect no
     * more task updates for the task.
     */
    cancelTask(request: CancelTaskRequest, callback: (error: ServiceError | null, response: Task) => void): ClientUnaryCall;
    cancelTask(request: CancelTaskRequest, metadata: Metadata, callback: (error: ServiceError | null, response: Task) => void): ClientUnaryCall;
    cancelTask(request: CancelTaskRequest, metadata: Metadata, options: Partial<CallOptions>, callback: (error: ServiceError | null, response: Task) => void): ClientUnaryCall;
    /**
     * TaskSubscription is a streaming call that will return a stream of task
     * update events. This attaches the stream to an existing in process task.
     * If the task is complete the stream will return the completed task (like
     * GetTask) and close the stream.
     */
    taskSubscription(request: TaskSubscriptionRequest, options?: Partial<CallOptions>): ClientReadableStream<StreamResponse>;
    taskSubscription(request: TaskSubscriptionRequest, metadata?: Metadata, options?: Partial<CallOptions>): ClientReadableStream<StreamResponse>;
    /** Set a push notification config for a task. */
    createTaskPushNotificationConfig(request: CreateTaskPushNotificationConfigRequest, callback: (error: ServiceError | null, response: TaskPushNotificationConfig) => void): ClientUnaryCall;
    createTaskPushNotificationConfig(request: CreateTaskPushNotificationConfigRequest, metadata: Metadata, callback: (error: ServiceError | null, response: TaskPushNotificationConfig) => void): ClientUnaryCall;
    createTaskPushNotificationConfig(request: CreateTaskPushNotificationConfigRequest, metadata: Metadata, options: Partial<CallOptions>, callback: (error: ServiceError | null, response: TaskPushNotificationConfig) => void): ClientUnaryCall;
    /** Get a push notification config for a task. */
    getTaskPushNotificationConfig(request: GetTaskPushNotificationConfigRequest, callback: (error: ServiceError | null, response: TaskPushNotificationConfig) => void): ClientUnaryCall;
    getTaskPushNotificationConfig(request: GetTaskPushNotificationConfigRequest, metadata: Metadata, callback: (error: ServiceError | null, response: TaskPushNotificationConfig) => void): ClientUnaryCall;
    getTaskPushNotificationConfig(request: GetTaskPushNotificationConfigRequest, metadata: Metadata, options: Partial<CallOptions>, callback: (error: ServiceError | null, response: TaskPushNotificationConfig) => void): ClientUnaryCall;
    /** Get a list of push notifications configured for a task. */
    listTaskPushNotificationConfig(request: ListTaskPushNotificationConfigRequest, callback: (error: ServiceError | null, response: ListTaskPushNotificationConfigResponse) => void): ClientUnaryCall;
    listTaskPushNotificationConfig(request: ListTaskPushNotificationConfigRequest, metadata: Metadata, callback: (error: ServiceError | null, response: ListTaskPushNotificationConfigResponse) => void): ClientUnaryCall;
    listTaskPushNotificationConfig(request: ListTaskPushNotificationConfigRequest, metadata: Metadata, options: Partial<CallOptions>, callback: (error: ServiceError | null, response: ListTaskPushNotificationConfigResponse) => void): ClientUnaryCall;
    /** GetAgentCard returns the agent card for the agent. */
    getAgentCard(request: GetAgentCardRequest, callback: (error: ServiceError | null, response: AgentCard) => void): ClientUnaryCall;
    getAgentCard(request: GetAgentCardRequest, metadata: Metadata, callback: (error: ServiceError | null, response: AgentCard) => void): ClientUnaryCall;
    getAgentCard(request: GetAgentCardRequest, metadata: Metadata, options: Partial<CallOptions>, callback: (error: ServiceError | null, response: AgentCard) => void): ClientUnaryCall;
    /** Delete a push notification config for a task. */
    deleteTaskPushNotificationConfig(request: DeleteTaskPushNotificationConfigRequest, callback: (error: ServiceError | null, response: Empty) => void): ClientUnaryCall;
    deleteTaskPushNotificationConfig(request: DeleteTaskPushNotificationConfigRequest, metadata: Metadata, callback: (error: ServiceError | null, response: Empty) => void): ClientUnaryCall;
    deleteTaskPushNotificationConfig(request: DeleteTaskPushNotificationConfigRequest, metadata: Metadata, options: Partial<CallOptions>, callback: (error: ServiceError | null, response: Empty) => void): ClientUnaryCall;
}
export declare const A2AServiceClient: {
    new (address: string, credentials: ChannelCredentials, options?: Partial<ClientOptions>): A2AServiceClient;
    service: typeof A2AServiceService;
    serviceName: string;
};
export interface MessageFns<T> {
    encode(message: T, writer?: BinaryWriter): BinaryWriter;
    decode(input: BinaryReader | Uint8Array, length?: number): T;
}
//# sourceMappingURL=a2a_services.d.ts.map