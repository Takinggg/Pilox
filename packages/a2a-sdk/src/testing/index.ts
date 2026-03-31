import type { AgentExecutor } from '../core/server/agent_execution/agent_executor.js';
import type { RequestContext } from '../core/server/agent_execution/request_context.js';
import type { ExecutionEventBus } from '../core/server/events/execution_event_bus.js';
import type { AgentCard } from '../core/types.js';

/**
 * Mock agent executor for testing.
 * Immediately completes with a configurable response.
 */
export class MockAgentExecutor implements AgentExecutor {
  public lastRequestContext?: RequestContext;
  public executionCount = 0;

  constructor(private readonly responseText: string = 'Mock response') {}

  async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    this.lastRequestContext = requestContext;
    this.executionCount++;

    const responseMessage = {
      kind: 'message' as const,
      role: 'agent' as const,
      messageId: `mock-${this.executionCount}`,
      parts: [{ kind: 'text' as const, text: this.responseText }],
      taskId: requestContext.taskId,
      contextId: requestContext.contextId,
    };

    eventBus.publish(responseMessage);

    eventBus.publish({
      kind: 'status-update',
      taskId: requestContext.taskId,
      contextId: requestContext.contextId,
      status: {
        state: 'completed',
        timestamp: new Date().toISOString(),
      },
      final: true,
    });

    eventBus.finished();
  }

  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    eventBus.publish({
      kind: 'status-update',
      taskId,
      contextId: '',
      status: {
        state: 'canceled',
        timestamp: new Date().toISOString(),
      },
      final: true,
    });
    eventBus.finished();
  }
}

/** Create a minimal Agent Card for testing */
export function createTestAgentCard(overrides: Partial<AgentCard> = {}): AgentCard {
  return {
    name: 'test-agent',
    url: 'http://localhost:3000',
    version: '1.0.0',
    capabilities: {
      streaming: false,
      pushNotifications: false,
    },
    skills: [],
    ...overrides,
  } as AgentCard;
}
