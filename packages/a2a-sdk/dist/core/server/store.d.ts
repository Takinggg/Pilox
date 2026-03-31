import { Task } from '../types.js';
import { ServerCallContext } from './context.js';
/**
 * Simplified interface for task storage providers.
 * Stores and retrieves the task.
 */
export interface TaskStore {
    /**
     * Saves a task.
     * Overwrites existing data if the task ID exists.
     * @param task The task to save.
     * @param context The context of the current call.
     * @returns A promise resolving when the save operation is complete.
     */
    save(task: Task, context?: ServerCallContext): Promise<void>;
    /**
     * Loads a task by task ID.
     * @param taskId The ID of the task to load.
     * @param context The context of the current call.
     * @returns A promise resolving to an object containing the Task, or undefined if not found.
     */
    load(taskId: string, context?: ServerCallContext): Promise<Task | undefined>;
}
export declare class InMemoryTaskStore implements TaskStore {
    private store;
    load(taskId: string): Promise<Task | undefined>;
    save(task: Task): Promise<void>;
}
//# sourceMappingURL=store.d.ts.map