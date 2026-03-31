import { Message, Task, TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from '../../types.js';
export type AgentExecutionEvent = Message | Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent;
/**
 * Event names supported by ExecutionEventBus.
 */
export type ExecutionEventName = 'event' | 'finished';
export interface ExecutionEventBus {
    publish(event: AgentExecutionEvent): void;
    on(eventName: ExecutionEventName, listener: (event: AgentExecutionEvent) => void): this;
    off(eventName: ExecutionEventName, listener: (event: AgentExecutionEvent) => void): this;
    once(eventName: ExecutionEventName, listener: (event: AgentExecutionEvent) => void): this;
    removeAllListeners(eventName?: ExecutionEventName): this;
    finished(): void;
}
/**
 * Web-compatible ExecutionEventBus using EventTarget.
 * Works across all modern runtimes: Node.js 15+, browsers, Cloudflare Workers, Deno, Bun.
 *
 * This implementation provides the subset of EventEmitter methods defined in the
 * ExecutionEventBus interface. Users extending DefaultExecutionEventBus should note
 * that other EventEmitter methods (e.g., listenerCount, rawListeners) are not available.
 */
export declare class DefaultExecutionEventBus extends EventTarget implements ExecutionEventBus {
    private readonly eventListeners;
    private readonly finishedListeners;
    publish(event: AgentExecutionEvent): void;
    finished(): void;
    /**
     * EventEmitter-compatible 'on' method.
     * Wraps the listener to extract event detail from CustomEvent.
     * Supports multiple registrations of the same listener (like EventEmitter).
     * @param eventName The event name to listen for.
     * @param listener The callback function to invoke when the event is emitted.
     * @returns This instance for method chaining.
     */
    on(eventName: ExecutionEventName, listener: (event: AgentExecutionEvent) => void): this;
    /**
     * EventEmitter-compatible 'off' method.
     * Uses the stored wrapped listener for proper removal.
     * Removes at most one instance of a listener per call (like EventEmitter).
     * @param eventName The event name to stop listening for.
     * @param listener The callback function to remove.
     * @returns This instance for method chaining.
     */
    off(eventName: ExecutionEventName, listener: (event: AgentExecutionEvent) => void): this;
    /**
     * EventEmitter-compatible 'once' method.
     * Listener is automatically removed after first invocation.
     * Supports multiple registrations of the same listener (like EventEmitter).
     * @param eventName The event name to listen for once.
     * @param listener The callback function to invoke when the event is emitted.
     * @returns This instance for method chaining.
     */
    once(eventName: ExecutionEventName, listener: (event: AgentExecutionEvent) => void): this;
    /**
     * EventEmitter-compatible 'removeAllListeners' method.
     * Removes all listeners for a specific event or all events.
     * @param eventName Optional event name to remove listeners for. If omitted, removes all.
     * @returns This instance for method chaining.
     */
    removeAllListeners(eventName?: ExecutionEventName): this;
    /**
     * Adds a wrapped listener to the tracking map.
     */
    private trackListener;
    /**
     * Removes a wrapped listener from the tracking map (for once cleanup).
     */
    private untrackWrappedListener;
    private addEventListenerInternal;
    private removeEventListenerInternal;
    private addEventListenerOnceInternal;
    private addFinishedListenerInternal;
    private removeFinishedListenerInternal;
    private addFinishedListenerOnceInternal;
}
//# sourceMappingURL=execution_event_bus.d.ts.map