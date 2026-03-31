import type { AgentExecutor } from '../core/server/agent_execution/agent_executor.js';
import type { RequestContext } from '../core/server/agent_execution/request_context.js';
import type { ExecutionEventBus } from '../core/server/events/execution_event_bus.js';
import type { AgentCard } from '../core/types.js';
/**
 * Mock agent executor for testing.
 * Immediately completes with a configurable response.
 */
export declare class MockAgentExecutor implements AgentExecutor {
    private readonly responseText;
    lastRequestContext?: RequestContext;
    executionCount: number;
    constructor(responseText?: string);
    execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void>;
    cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void>;
}
/** Create a minimal Agent Card for testing */
export declare function createTestAgentCard(overrides?: Partial<AgentCard>): AgentCard;
//# sourceMappingURL=index.d.ts.map