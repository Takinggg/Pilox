import type { AgentCard, Message, Task } from '../core/types.js';
/**
 * Base context passed through the middleware chain.
 * Extended by server/client specific contexts.
 */
export interface MiddlewareContext {
    /** Unique request ID for tracing */
    readonly requestId: string;
    /** Timestamp of request entry (ms since epoch) */
    readonly timestamp: number;
    /** Agent card of the local agent */
    readonly localAgentCard: AgentCard;
    /** Agent card of the remote peer (if resolved) */
    remoteAgentCard?: AgentCard;
    /** Cross-middleware metadata bag */
    readonly metadata: Map<string, unknown>;
    /** Whether Noise E2E channel is active for this request */
    noiseSessionActive: boolean;
    /** Audit chain ID for linking request/response entries */
    auditChainId?: string;
}
/**
 * Server-side middleware context (inbound requests).
 */
export interface ServerMiddlewareContext extends MiddlewareContext {
    readonly direction: 'inbound';
    /** A2A method being called (e.g., 'message/send', 'tasks/get') */
    readonly method: string;
    /** Raw JSON-RPC params */
    params: unknown;
    /** Parsed message (for message/send, message/stream) */
    message?: Message;
    /** Task associated with this request */
    task?: Task;
    /** Response to return */
    response?: unknown;
    /** Short-circuit with error */
    error?: Error;
}
/**
 * Client-side middleware context (outbound requests).
 */
export interface ClientMiddlewareContext extends MiddlewareContext {
    readonly direction: 'outbound';
    /** A2A method being called */
    readonly method: string;
    /** Outgoing params */
    params: unknown;
    /** Response from remote */
    response?: unknown;
    /** Error from remote */
    error?: Error;
}
/**
 * Middleware function. Receives context and next.
 * Can run logic before AND after next() (onion model).
 */
export type MiddlewareFn<T extends MiddlewareContext = MiddlewareContext> = (ctx: T, next: () => Promise<void>) => Promise<void>;
/**
 * Named middleware with priority for ordering.
 * Lower priority = runs earlier in the pipeline.
 */
export interface Middleware<T extends MiddlewareContext = MiddlewareContext> {
    /** Human-readable name for debugging/audit */
    readonly name: string;
    /** Execution priority. Built-in middleware uses 100, 200, 300... */
    readonly priority: number;
    /** The middleware function */
    readonly execute: MiddlewareFn<T>;
    /** Runtime toggle */
    enabled: boolean;
}
//# sourceMappingURL=types.d.ts.map