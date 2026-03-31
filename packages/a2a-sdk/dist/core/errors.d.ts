export declare const A2A_ERROR_CODE: {
    readonly PARSE_ERROR: -32700;
    readonly INVALID_REQUEST: -32600;
    readonly METHOD_NOT_FOUND: -32601;
    readonly INVALID_PARAMS: -32602;
    readonly INTERNAL_ERROR: -32603;
    readonly TASK_NOT_FOUND: -32001;
    readonly TASK_NOT_CANCELABLE: -32002;
    readonly PUSH_NOTIFICATION_NOT_SUPPORTED: -32003;
    readonly UNSUPPORTED_OPERATION: -32004;
    readonly CONTENT_TYPE_NOT_SUPPORTED: -32005;
    readonly INVALID_AGENT_RESPONSE: -32006;
    readonly AUTHENTICATED_EXTENDED_CARD_NOT_CONFIGURED: -32007;
};
export declare class TaskNotFoundError extends Error {
    constructor(message?: string);
}
export declare class TaskNotCancelableError extends Error {
    constructor(message?: string);
}
export declare class PushNotificationNotSupportedError extends Error {
    constructor(message?: string);
}
export declare class UnsupportedOperationError extends Error {
    constructor(message?: string);
}
export declare class ContentTypeNotSupportedError extends Error {
    constructor(message?: string);
}
export declare class InvalidAgentResponseError extends Error {
    constructor(message?: string);
}
export declare class AuthenticatedExtendedCardNotConfiguredError extends Error {
    constructor(message?: string);
}
//# sourceMappingURL=errors.d.ts.map