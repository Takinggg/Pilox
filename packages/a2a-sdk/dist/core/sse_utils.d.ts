/**
 * Shared Server-Sent Events (SSE) utilities for both JSON-RPC and REST transports.
 * This module provides common SSE formatting and parsing functions.
 */
/**
 * Standard HTTP headers for Server-Sent Events (SSE) streaming responses.
 * These headers ensure proper SSE behavior across different proxies and clients.
 */
export declare const SSE_HEADERS: {
    readonly 'Content-Type': "text/event-stream";
    readonly 'Cache-Control': "no-cache";
    readonly Connection: "keep-alive";
    readonly 'X-Accel-Buffering': "no";
};
/**
 * Represents a parsed SSE event with type and data.
 */
export interface SseEvent {
    type: string;
    data: string;
}
/**
 * Formats a data event for Server-Sent Events (SSE) protocol.
 * Creates a standard SSE event with an ID and JSON-stringified data.
 *
 * @param event - The event data to send (will be JSON stringified)
 * @returns Formatted SSE event string following the SSE specification
 *
 * @example
 * ```ts
 * formatSSEEvent({ kind: 'message', text: 'Hello' })
 * // Returns: "data: {\"kind\":\"message\",\"text\":\"Hello\"}\n\n"
 *
 * formatSSEEvent({ result: 'success' }, 'custom-id')
 * // Returns: "data: {\"result\":\"success\"}\n\n"
 * ```
 */
export declare function formatSSEEvent(event: unknown): string;
/**
 * Formats an error event for Server-Sent Events (SSE) protocol.
 * Error events use the "error" event type to distinguish them from data events,
 * allowing clients to handle errors differently.
 *
 * @param error - The error object (will be JSON stringified)
 * @returns Formatted SSE error event string with custom event type
 *
 * @example
 * ```ts
 * formatSSEErrorEvent({ code: -32603, message: 'Internal error' })
 * // Returns: "event: error\ndata: {\"code\":-32603,\"message\":\"Internal error\"}\n\n"
 * ```
 */
export declare function formatSSEErrorEvent(error: unknown): string;
/**
 * Parses a Server-Sent Events (SSE) stream from a Response object.
 * Yields parsed SSE events as they arrive.
 *
 * This parser expects well-formed SSE events with single-line JSON data,
 * matching the format produced by formatSSEEvent and formatSSEErrorEvent.
 *
 * @param response - The fetch Response containing an SSE stream
 * @yields SseEvent objects with type and data fields
 *
 * @example
 * ```ts
 * for await (const event of parseSseStream(response)) {
 *   if (event.type === 'error') {
 *     handleError(JSON.parse(event.data));
 *   } else {
 *     handleData(JSON.parse(event.data));
 *   }
 * }
 * ```
 */
export declare function parseSseStream(response: Response): AsyncGenerator<SseEvent, void, undefined>;
//# sourceMappingURL=sse_utils.d.ts.map