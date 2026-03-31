import { Message, Task } from '../../types.js';
import { ServerCallContext } from '../context.js';
export declare class RequestContext {
    readonly userMessage: Message;
    readonly taskId: string;
    readonly contextId: string;
    readonly task?: Task;
    readonly referenceTasks?: Task[];
    readonly context?: ServerCallContext;
    constructor(userMessage: Message, taskId: string, contextId: string, task?: Task, referenceTasks?: Task[], context?: ServerCallContext);
}
//# sourceMappingURL=request_context.d.ts.map