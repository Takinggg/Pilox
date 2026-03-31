export declare const protobufPackage = "a2a.v1";
/** Older protoc compilers don't understand edition yet. */
/** The set of states a Task can be in. */
export declare enum TaskState {
    TASK_STATE_UNSPECIFIED = 0,
    /** TASK_STATE_SUBMITTED - Represents the status that acknowledges a task is created */
    TASK_STATE_SUBMITTED = 1,
    /** TASK_STATE_WORKING - Represents the status that a task is actively being processed */
    TASK_STATE_WORKING = 2,
    /** TASK_STATE_COMPLETED - Represents the status a task is finished. This is a terminal state */
    TASK_STATE_COMPLETED = 3,
    /** TASK_STATE_FAILED - Represents the status a task is done but failed. This is a terminal state */
    TASK_STATE_FAILED = 4,
    /**
     * TASK_STATE_CANCELLED - Represents the status a task was cancelled before it finished.
     * This is a terminal state.
     */
    TASK_STATE_CANCELLED = 5,
    /**
     * TASK_STATE_INPUT_REQUIRED - Represents the status that the task requires information to complete.
     * This is an interrupted state.
     */
    TASK_STATE_INPUT_REQUIRED = 6,
    /**
     * TASK_STATE_REJECTED - Represents the status that the agent has decided to not perform the task.
     * This may be done during initial task creation or later once an agent
     * has determined it can't or won't proceed. This is a terminal state.
     */
    TASK_STATE_REJECTED = 7,
    /**
     * TASK_STATE_AUTH_REQUIRED - Represents the state that some authentication is needed from the upstream
     * client. Authentication is expected to come out-of-band thus this is not
     * an interrupted or terminal state.
     */
    TASK_STATE_AUTH_REQUIRED = 8,
    UNRECOGNIZED = -1
}
export declare function taskStateFromJSON(object: any): TaskState;
export declare function taskStateToJSON(object: TaskState): string;
export declare enum Role {
    ROLE_UNSPECIFIED = 0,
    /** ROLE_USER - USER role refers to communication from the client to the server. */
    ROLE_USER = 1,
    /** ROLE_AGENT - AGENT role refers to communication from the server to the client. */
    ROLE_AGENT = 2,
    UNRECOGNIZED = -1
}
export declare function roleFromJSON(object: any): Role;
export declare function roleToJSON(object: Role): string;
/** Configuration of a send message request. */
export interface SendMessageConfiguration {
    /** The output modes that the agent is expected to respond with. */
    acceptedOutputModes: string[];
    /** A configuration of a webhook that can be used to receive updates */
    pushNotification: PushNotificationConfig | undefined;
    /**
     * The maximum number of messages to include in the history. if 0, the
     * history will be unlimited.
     */
    historyLength: number;
    /**
     * If true, the message will be blocking until the task is completed. If
     * false, the message will be non-blocking and the task will be returned
     * immediately. It is the caller's responsibility to check for any task
     * updates.
     */
    blocking: boolean;
}
/**
 * Task is the core unit of action for A2A. It has a current status
 * and when results are created for the task they are stored in the
 * artifact. If there are multiple turns for a task, these are stored in
 * history.
 */
export interface Task {
    /** Unique identifier for a task, created by the A2A server. */
    id: string;
    /**
     * Unique identifier for the contextual collection of interactions (tasks
     * and messages). Created by the A2A server.
     */
    contextId: string;
    /** The current status of a Task, including state and a message. */
    status: TaskStatus | undefined;
    /** A set of output artifacts for a Task. */
    artifacts: Artifact[];
    /**
     * protolint:disable REPEATED_FIELD_NAMES_PLURALIZED
     * The history of interactions from a task.
     */
    history: Message[];
    /**
     * protolint:enable REPEATED_FIELD_NAMES_PLURALIZED
     * A key/value object to store custom metadata about a task.
     */
    metadata: {
        [key: string]: any;
    } | undefined;
}
/** A container for the status of a task */
export interface TaskStatus {
    /** The current state of this task */
    state: TaskState;
    /** A message associated with the status. */
    update: Message | undefined;
    /**
     * Timestamp when the status was recorded.
     * Example: "2023-10-27T10:00:00Z"
     */
    timestamp: string | undefined;
}
/**
 * Part represents a container for a section of communication content.
 * Parts can be purely textual, some sort of file (image, video, etc) or
 * a structured data blob (i.e. JSON).
 */
export interface Part {
    part?: {
        $case: "text";
        value: string;
    } | {
        $case: "file";
        value: FilePart;
    } | {
        $case: "data";
        value: DataPart;
    } | undefined;
}
/**
 * FilePart represents the different ways files can be provided. If files are
 * small, directly feeding the bytes is supported via file_with_bytes. If the
 * file is large, the agent should read the content as appropriate directly
 * from the file_with_uri source.
 */
export interface FilePart {
    file?: {
        $case: "fileWithUri";
        value: string;
    } | {
        $case: "fileWithBytes";
        value: Buffer;
    } | undefined;
    mimeType: string;
}
/** DataPart represents a structured blob. This is most commonly a JSON payload. */
export interface DataPart {
    data: {
        [key: string]: any;
    } | undefined;
}
/**
 * Message is one unit of communication between client and server. It is
 * associated with a context and optionally a task. Since the server is
 * responsible for the context definition, it must always provide a context_id
 * in its messages. The client can optionally provide the context_id if it
 * knows the context to associate the message to. Similarly for task_id,
 * except the server decides if a task is created and whether to include the
 * task_id.
 */
export interface Message {
    /**
     * The message id of the message. This is required and created by the
     * message creator.
     */
    messageId: string;
    /**
     * The context id of the message. This is optional and if set, the message
     * will be associated with the given context.
     */
    contextId: string;
    /**
     * The task id of the message. This is optional and if set, the message
     * will be associated with the given task.
     */
    taskId: string;
    /** A role for the message. */
    role: Role;
    /**
     * protolint:disable REPEATED_FIELD_NAMES_PLURALIZED
     * Content is the container of the message content.
     */
    content: Part[];
    /**
     * protolint:enable REPEATED_FIELD_NAMES_PLURALIZED
     * Any optional metadata to provide along with the message.
     */
    metadata: {
        [key: string]: any;
    } | undefined;
    /** The URIs of extensions that are present or contributed to this Message. */
    extensions: string[];
}
/**
 * Artifacts are the container for task completed results. These are similar
 * to Messages but are intended to be the product of a task, as opposed to
 * point-to-point communication.
 */
export interface Artifact {
    /** Unique id for the artifact. It must be at least unique within a task. */
    artifactId: string;
    /** A human readable name for the artifact. */
    name: string;
    /** A human readable description of the artifact, optional. */
    description: string;
    /** The content of the artifact. */
    parts: Part[];
    /** Optional metadata included with the artifact. */
    metadata: {
        [key: string]: any;
    } | undefined;
    /** The URIs of extensions that are present or contributed to this Artifact. */
    extensions: string[];
}
/**
 * TaskStatusUpdateEvent is a delta even on a task indicating that a task
 * has changed.
 */
export interface TaskStatusUpdateEvent {
    /** The id of the task that is changed */
    taskId: string;
    /** The id of the context that the task belongs to */
    contextId: string;
    /** The new status of the task. */
    status: TaskStatus | undefined;
    /** Whether this is the last status update expected for this task. */
    final: boolean;
    /** Optional metadata to associate with the task update. */
    metadata: {
        [key: string]: any;
    } | undefined;
}
/**
 * TaskArtifactUpdateEvent represents a task delta where an artifact has
 * been generated.
 */
export interface TaskArtifactUpdateEvent {
    /** The id of the task for this artifact */
    taskId: string;
    /** The id of the context that this task belongs too */
    contextId: string;
    /** The artifact itself */
    artifact: Artifact | undefined;
    /** Whether this should be appended to a prior one produced */
    append: boolean;
    /** Whether this represents the last part of an artifact */
    lastChunk: boolean;
    /** Optional metadata associated with the artifact update. */
    metadata: {
        [key: string]: any;
    } | undefined;
}
/** Configuration for setting up push notifications for task updates. */
export interface PushNotificationConfig {
    /** A unique id for this push notification. */
    id: string;
    /** Url to send the notification too */
    url: string;
    /** Token unique for this task/session */
    token: string;
    /** Information about the authentication to sent with the notification */
    authentication: AuthenticationInfo | undefined;
}
/** Defines authentication details, used for push notifications. */
export interface AuthenticationInfo {
    /** Supported authentication schemes - e.g. Basic, Bearer, etc */
    schemes: string[];
    /** Optional credentials */
    credentials: string;
}
/** Defines additional transport information for the agent. */
export interface AgentInterface {
    /** The url this interface is found at. */
    url: string;
    /**
     * The transport supported this url. This is an open form string, to be
     * easily extended for many transport protocols. The core ones officially
     * supported are JSONRPC, GRPC and HTTP+JSON.
     */
    transport: string;
}
/**
 * AgentCard conveys key information:
 * - Overall details (version, name, description, uses)
 * - Skills; a set of actions/solutions the agent can perform
 * - Default modalities/content types supported by the agent.
 * - Authentication requirements
 * Next ID: 18
 */
export interface AgentCard {
    /** The version of the A2A protocol this agent supports. */
    protocolVersion: string;
    /**
     * A human readable name for the agent.
     * Example: "Recipe Agent"
     */
    name: string;
    /**
     * A description of the agent's domain of action/solution space.
     * Example: "Agent that helps users with recipes and cooking."
     */
    description: string;
    /**
     * A URL to the address the agent is hosted at. This represents the
     * preferred endpoint as declared by the agent.
     */
    url: string;
    /** The transport of the preferred endpoint. If empty, defaults to JSONRPC. */
    preferredTransport: string;
    /**
     * Announcement of additional supported transports. Client can use any of
     * the supported transports.
     */
    additionalInterfaces: AgentInterface[];
    /** The service provider of the agent. */
    provider: AgentProvider | undefined;
    /**
     * The version of the agent.
     * Example: "1.0.0"
     */
    version: string;
    /** A url to provide additional documentation about the agent. */
    documentationUrl: string;
    /** A2A Capability set supported by the agent. */
    capabilities: AgentCapabilities | undefined;
    /** The security scheme details used for authenticating with this agent. */
    securitySchemes: {
        [key: string]: SecurityScheme;
    };
    /**
     * protolint:disable REPEATED_FIELD_NAMES_PLURALIZED
     * Security requirements for contacting the agent.
     * This list can be seen as an OR of ANDs. Each object in the list describes
     * one possible set of security requirements that must be present on a
     * request. This allows specifying, for example, "callers must either use
     * OAuth OR an API Key AND mTLS."
     * Example:
     * security {
     *   schemes { key: "oauth" value { list: ["read"] } }
     * }
     * security {
     *   schemes { key: "api-key" }
     *   schemes { key: "mtls" }
     * }
     */
    security: Security[];
    /**
     * protolint:enable REPEATED_FIELD_NAMES_PLURALIZED
     * The set of interaction modes that the agent supports across all skills.
     * This can be overridden per skill. Defined as mime types.
     */
    defaultInputModes: string[];
    /** The mime types supported as outputs from this agent. */
    defaultOutputModes: string[];
    /**
     * Skills represent a unit of ability an agent can perform. This may
     * somewhat abstract but represents a more focused set of actions that the
     * agent is highly likely to succeed at.
     */
    skills: AgentSkill[];
    /**
     * Whether the agent supports providing an extended agent card when
     * the user is authenticated, i.e. is the card from .well-known
     * different than the card from GetAgentCard.
     */
    supportsAuthenticatedExtendedCard: boolean;
    /** JSON Web Signatures computed for this AgentCard. */
    signatures: AgentCardSignature[];
}
export interface AgentCard_SecuritySchemesEntry {
    key: string;
    value: SecurityScheme | undefined;
}
/** Represents information about the service provider of an agent. */
export interface AgentProvider {
    /**
     * The providers reference url
     * Example: "https://ai.google.dev"
     */
    url: string;
    /**
     * The providers organization name
     * Example: "Google"
     */
    organization: string;
}
/** Defines the A2A feature set supported by the agent */
export interface AgentCapabilities {
    /** If the agent will support streaming responses */
    streaming: boolean;
    /** If the agent can send push notifications to the clients webhook */
    pushNotifications: boolean;
    /** Extensions supported by this agent. */
    extensions: AgentExtension[];
}
/** A declaration of an extension supported by an Agent. */
export interface AgentExtension {
    /**
     * The URI of the extension.
     * Example: "https://developers.google.com/identity/protocols/oauth2"
     */
    uri: string;
    /**
     * A description of how this agent uses this extension.
     * Example: "Google OAuth 2.0 authentication"
     */
    description: string;
    /**
     * Whether the client must follow specific requirements of the extension.
     * Example: false
     */
    required: boolean;
    /** Optional configuration for the extension. */
    params: {
        [key: string]: any;
    } | undefined;
}
/**
 * AgentSkill represents a unit of action/solution that the agent can perform.
 * One can think of this as a type of highly reliable solution that an agent
 * can be tasked to provide. Agents have the autonomy to choose how and when
 * to use specific skills, but clients should have confidence that if the
 * skill is defined that unit of action can be reliably performed.
 */
export interface AgentSkill {
    /** Unique id of the skill within this agent. */
    id: string;
    /** A human readable name for the skill. */
    name: string;
    /**
     * A human (or llm) readable description of the skill
     * details and behaviors.
     */
    description: string;
    /**
     * A set of tags for the skill to enhance categorization/utilization.
     * Example: ["cooking", "customer support", "billing"]
     */
    tags: string[];
    /**
     * A set of example queries that this skill is designed to address.
     * These examples should help the caller to understand how to craft requests
     * to the agent to achieve specific goals.
     * Example: ["I need a recipe for bread"]
     */
    examples: string[];
    /** Possible input modalities supported. */
    inputModes: string[];
    /** Possible output modalities produced */
    outputModes: string[];
    /**
     * protolint:disable REPEATED_FIELD_NAMES_PLURALIZED
     * Security schemes necessary for the agent to leverage this skill.
     * As in the overall AgentCard.security, this list represents a logical OR of
     * security requirement objects. Each object is a set of security schemes
     * that must be used together (a logical AND).
     */
    security: Security[];
}
/**
 * AgentCardSignature represents a JWS signature of an AgentCard.
 * This follows the JSON format of an RFC 7515 JSON Web Signature (JWS).
 */
export interface AgentCardSignature {
    /**
     * The protected JWS header for the signature. This is always a
     * base64url-encoded JSON object. Required.
     */
    protected: string;
    /** The computed signature, base64url-encoded. Required. */
    signature: string;
    /** The unprotected JWS header values. */
    header: {
        [key: string]: any;
    } | undefined;
}
export interface TaskPushNotificationConfig {
    /** name=tasks/{id}/pushNotificationConfigs/{id} */
    name: string;
    pushNotificationConfig: PushNotificationConfig | undefined;
}
/** protolint:disable REPEATED_FIELD_NAMES_PLURALIZED */
export interface StringList {
    list: string[];
}
export interface Security {
    schemes: {
        [key: string]: StringList;
    };
}
export interface Security_SchemesEntry {
    key: string;
    value: StringList | undefined;
}
export interface SecurityScheme {
    scheme?: {
        $case: "apiKeySecurityScheme";
        value: APIKeySecurityScheme;
    } | {
        $case: "httpAuthSecurityScheme";
        value: HTTPAuthSecurityScheme;
    } | {
        $case: "oauth2SecurityScheme";
        value: OAuth2SecurityScheme;
    } | {
        $case: "openIdConnectSecurityScheme";
        value: OpenIdConnectSecurityScheme;
    } | {
        $case: "mtlsSecurityScheme";
        value: MutualTlsSecurityScheme;
    } | undefined;
}
export interface APIKeySecurityScheme {
    /** Description of this security scheme. */
    description: string;
    /** Location of the API key, valid values are "query", "header", or "cookie" */
    location: string;
    /** Name of the header, query or cookie parameter to be used. */
    name: string;
}
export interface HTTPAuthSecurityScheme {
    /** Description of this security scheme. */
    description: string;
    /**
     * The name of the HTTP Authentication scheme to be used in the
     * Authorization header as defined in RFC7235. The values used SHOULD be
     * registered in the IANA Authentication Scheme registry.
     * The value is case-insensitive, as defined in RFC7235.
     */
    scheme: string;
    /**
     * A hint to the client to identify how the bearer token is formatted.
     * Bearer tokens are usually generated by an authorization server, so
     * this information is primarily for documentation purposes.
     */
    bearerFormat: string;
}
export interface OAuth2SecurityScheme {
    /** Description of this security scheme. */
    description: string;
    /** An object containing configuration information for the flow types supported */
    flows: OAuthFlows | undefined;
    /**
     * URL to the oauth2 authorization server metadata
     * [RFC8414](https://datatracker.ietf.org/doc/html/rfc8414). TLS is required.
     */
    oauth2MetadataUrl: string;
}
export interface OpenIdConnectSecurityScheme {
    /** Description of this security scheme. */
    description: string;
    /**
     * Well-known URL to discover the [[OpenID-Connect-Discovery]] provider
     * metadata.
     */
    openIdConnectUrl: string;
}
export interface MutualTlsSecurityScheme {
    /** Description of this security scheme. */
    description: string;
}
export interface OAuthFlows {
    flow?: {
        $case: "authorizationCode";
        value: AuthorizationCodeOAuthFlow;
    } | {
        $case: "clientCredentials";
        value: ClientCredentialsOAuthFlow;
    } | {
        $case: "implicit";
        value: ImplicitOAuthFlow;
    } | {
        $case: "password";
        value: PasswordOAuthFlow;
    } | undefined;
}
export interface AuthorizationCodeOAuthFlow {
    /**
     * The authorization URL to be used for this flow. This MUST be in the
     * form of a URL. The OAuth2 standard requires the use of TLS
     */
    authorizationUrl: string;
    /**
     * The token URL to be used for this flow. This MUST be in the form of a URL.
     * The OAuth2 standard requires the use of TLS.
     */
    tokenUrl: string;
    /**
     * The URL to be used for obtaining refresh tokens. This MUST be in the
     * form of a URL. The OAuth2 standard requires the use of TLS.
     */
    refreshUrl: string;
    /**
     * The available scopes for the OAuth2 security scheme. A map between the
     * scope name and a short description for it. The map MAY be empty.
     */
    scopes: {
        [key: string]: string;
    };
}
export interface AuthorizationCodeOAuthFlow_ScopesEntry {
    key: string;
    value: string;
}
export interface ClientCredentialsOAuthFlow {
    /**
     * The token URL to be used for this flow. This MUST be in the form of a URL.
     * The OAuth2 standard requires the use of TLS.
     */
    tokenUrl: string;
    /**
     * The URL to be used for obtaining refresh tokens. This MUST be in the
     * form of a URL. The OAuth2 standard requires the use of TLS.
     */
    refreshUrl: string;
    /**
     * The available scopes for the OAuth2 security scheme. A map between the
     * scope name and a short description for it. The map MAY be empty.
     */
    scopes: {
        [key: string]: string;
    };
}
export interface ClientCredentialsOAuthFlow_ScopesEntry {
    key: string;
    value: string;
}
export interface ImplicitOAuthFlow {
    /**
     * The authorization URL to be used for this flow. This MUST be in the
     * form of a URL. The OAuth2 standard requires the use of TLS
     */
    authorizationUrl: string;
    /**
     * The URL to be used for obtaining refresh tokens. This MUST be in the
     * form of a URL. The OAuth2 standard requires the use of TLS.
     */
    refreshUrl: string;
    /**
     * The available scopes for the OAuth2 security scheme. A map between the
     * scope name and a short description for it. The map MAY be empty.
     */
    scopes: {
        [key: string]: string;
    };
}
export interface ImplicitOAuthFlow_ScopesEntry {
    key: string;
    value: string;
}
export interface PasswordOAuthFlow {
    /**
     * The token URL to be used for this flow. This MUST be in the form of a URL.
     * The OAuth2 standard requires the use of TLS.
     */
    tokenUrl: string;
    /**
     * The URL to be used for obtaining refresh tokens. This MUST be in the
     * form of a URL. The OAuth2 standard requires the use of TLS.
     */
    refreshUrl: string;
    /**
     * The available scopes for the OAuth2 security scheme. A map between the
     * scope name and a short description for it. The map MAY be empty.
     */
    scopes: {
        [key: string]: string;
    };
}
export interface PasswordOAuthFlow_ScopesEntry {
    key: string;
    value: string;
}
/** /////////// Request Messages /////////// */
export interface SendMessageRequest {
    request: Message | undefined;
    configuration: SendMessageConfiguration | undefined;
    metadata: {
        [key: string]: any;
    } | undefined;
}
export interface GetTaskRequest {
    /** name=tasks/{id} */
    name: string;
    historyLength: number;
}
export interface CancelTaskRequest {
    /** name=tasks/{id} */
    name: string;
}
export interface GetTaskPushNotificationConfigRequest {
    /** name=tasks/{id}/pushNotificationConfigs/{push_id} */
    name: string;
}
export interface DeleteTaskPushNotificationConfigRequest {
    /** name=tasks/{id}/pushNotificationConfigs/{push_id} */
    name: string;
}
export interface CreateTaskPushNotificationConfigRequest {
    /**
     * The task resource for this config.
     * Format: tasks/{id}
     */
    parent: string;
    configId: string;
    config: TaskPushNotificationConfig | undefined;
}
export interface TaskSubscriptionRequest {
    /** name=tasks/{id} */
    name: string;
}
export interface ListTaskPushNotificationConfigRequest {
    /** parent=tasks/{id} */
    parent: string;
    /**
     * For AIP-158 these fields are present. Usually not used/needed.
     * The maximum number of configurations to return.
     * If unspecified, all configs will be returned.
     */
    pageSize: number;
    /**
     * A page token received from a previous
     * ListTaskPushNotificationConfigRequest call.
     * Provide this to retrieve the subsequent page.
     * When paginating, all other parameters provided to
     * `ListTaskPushNotificationConfigRequest` must match the call that provided
     * the page token.
     */
    pageToken: string;
}
/** Empty. Added to fix linter violation. */
export interface GetAgentCardRequest {
}
/** ////// Response Messages /////////// */
export interface SendMessageResponse {
    payload?: {
        $case: "task";
        value: Task;
    } | {
        $case: "msg";
        value: Message;
    } | undefined;
}
/**
 * The stream response for a message. The stream should be one of the following
 * sequences:
 * If the response is a message, the stream should contain one, and only one,
 * message and then close
 * If the response is a task lifecycle, the first response should be a Task
 * object followed by zero or more TaskStatusUpdateEvents and
 * TaskArtifactUpdateEvents. The stream should complete when the Task
 * if in an interrupted or terminal state. A stream that ends before these
 * conditions are met are
 */
export interface StreamResponse {
    payload?: {
        $case: "task";
        value: Task;
    } | {
        $case: "msg";
        value: Message;
    } | {
        $case: "statusUpdate";
        value: TaskStatusUpdateEvent;
    } | {
        $case: "artifactUpdate";
        value: TaskArtifactUpdateEvent;
    } | undefined;
}
export interface ListTaskPushNotificationConfigResponse {
    configs: TaskPushNotificationConfig[];
    /**
     * A token, which can be sent as `page_token` to retrieve the next page.
     * If this field is omitted, there are no subsequent pages.
     */
    nextPageToken: string;
}
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
export interface MessageFns<T> {
    fromJSON(object: any): T;
    toJSON(message: T): unknown;
}
//# sourceMappingURL=a2a_types.d.ts.map