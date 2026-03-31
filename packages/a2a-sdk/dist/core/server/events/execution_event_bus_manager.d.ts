import { ExecutionEventBus } from './execution_event_bus.js';
export interface ExecutionEventBusManager {
    createOrGetByTaskId(taskId: string): ExecutionEventBus;
    getByTaskId(taskId: string): ExecutionEventBus | undefined;
    cleanupByTaskId(taskId: string): void;
}
export declare class DefaultExecutionEventBusManager implements ExecutionEventBusManager {
    private taskIdToBus;
    /**
     * Creates or retrieves an existing ExecutionEventBus based on the taskId.
     * @param taskId The ID of the task.
     * @returns An instance of ExecutionEventBus.
     */
    createOrGetByTaskId(taskId: string): ExecutionEventBus;
    /**
     * Retrieves an existing ExecutionEventBus based on the taskId.
     * @param taskId The ID of the task.
     * @returns An instance of ExecutionEventBus or undefined if not found.
     */
    getByTaskId(taskId: string): ExecutionEventBus | undefined;
    /**
     * Removes the event bus for a given taskId.
     * This should be called when an execution flow is complete to free resources.
     * @param taskId The ID of the task.
     */
    cleanupByTaskId(taskId: string): void;
}
//# sourceMappingURL=execution_event_bus_manager.d.ts.map