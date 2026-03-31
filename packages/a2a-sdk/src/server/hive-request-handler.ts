import type {
  Message,
  AgentCard,
  Task,
  MessageSendParams,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
  TaskQueryParams,
  TaskIdParams,
  TaskPushNotificationConfig,
  GetTaskPushNotificationConfigParams,
  ListTaskPushNotificationConfigParams,
  DeleteTaskPushNotificationConfigParams,
} from '../core/types.js';
import type { A2ARequestHandler } from '../core/server/request_handler/a2a_request_handler.js';
import type { ServerCallContext } from '../core/server/context.js';
import type { Middleware, ServerMiddlewareContext, MiddlewareFn } from '../middleware/types.js';
import { compose } from '../middleware/compose.js';
import { createServerContext } from '../middleware/context.js';

/**
 * PiloxRequestHandler wraps the upstream DefaultRequestHandler
 * and injects the middleware pipeline around every A2A method call.
 */
export class PiloxRequestHandler implements A2ARequestHandler {
  private readonly pipeline: MiddlewareFn<ServerMiddlewareContext>;

  constructor(
    private readonly upstream: A2ARequestHandler,
    private readonly agentCard: AgentCard,
    middlewares: Middleware<ServerMiddlewareContext>[],
  ) {
    this.pipeline = compose(middlewares);
  }

  async getAgentCard(): Promise<AgentCard> {
    return this.upstream.getAgentCard();
  }

  async getAuthenticatedExtendedAgentCard(context?: ServerCallContext): Promise<AgentCard> {
    return this.upstream.getAuthenticatedExtendedAgentCard(context);
  }

  async sendMessage(
    params: MessageSendParams,
    context?: ServerCallContext,
  ): Promise<Message | Task> {
    const ctx = createServerContext('message/send', params, this.agentCard);
    ctx.message = params.message;

    await this.pipeline(ctx, async () => {
      ctx.response = await this.upstream.sendMessage(
        ctx.params as MessageSendParams,
        context,
      );
    });

    if (ctx.error) throw ctx.error;
    return ctx.response as Message | Task;
  }

  async *sendMessageStream(
    params: MessageSendParams,
    context?: ServerCallContext,
  ): AsyncGenerator<
    Message | Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent,
    void,
    undefined
  > {
    // For streaming, we validate the initial request through the pipeline
    // but stream events directly from upstream
    const ctx = createServerContext('message/stream', params, this.agentCard);
    ctx.message = params.message;

    let pipelineError: Error | undefined;
    await this.pipeline(ctx, async () => {
      // Pipeline passed -- we'll stream from upstream below
    });

    if (ctx.error) throw ctx.error;
    if (pipelineError) throw pipelineError;

    yield* this.upstream.sendMessageStream(
      ctx.params as MessageSendParams,
      context,
    );
  }

  async getTask(params: TaskQueryParams, context?: ServerCallContext): Promise<Task> {
    const ctx = createServerContext('tasks/get', params, this.agentCard);

    await this.pipeline(ctx, async () => {
      ctx.response = await this.upstream.getTask(
        ctx.params as TaskQueryParams,
        context,
      );
    });

    if (ctx.error) throw ctx.error;
    return ctx.response as Task;
  }

  async cancelTask(params: TaskIdParams, context?: ServerCallContext): Promise<Task> {
    const ctx = createServerContext('tasks/cancel', params, this.agentCard);

    await this.pipeline(ctx, async () => {
      ctx.response = await this.upstream.cancelTask(
        ctx.params as TaskIdParams,
        context,
      );
    });

    if (ctx.error) throw ctx.error;
    return ctx.response as Task;
  }

  async setTaskPushNotificationConfig(
    params: TaskPushNotificationConfig,
    context?: ServerCallContext,
  ): Promise<TaskPushNotificationConfig> {
    return this.upstream.setTaskPushNotificationConfig(params, context);
  }

  async getTaskPushNotificationConfig(
    params: TaskIdParams | GetTaskPushNotificationConfigParams,
    context?: ServerCallContext,
  ): Promise<TaskPushNotificationConfig> {
    return this.upstream.getTaskPushNotificationConfig(params, context);
  }

  async listTaskPushNotificationConfigs(
    params: ListTaskPushNotificationConfigParams,
    context?: ServerCallContext,
  ): Promise<TaskPushNotificationConfig[]> {
    return this.upstream.listTaskPushNotificationConfigs(params, context);
  }

  async deleteTaskPushNotificationConfig(
    params: DeleteTaskPushNotificationConfigParams,
    context?: ServerCallContext,
  ): Promise<void> {
    return this.upstream.deleteTaskPushNotificationConfig(params, context);
  }

  async *resubscribe(
    params: TaskIdParams,
    context?: ServerCallContext,
  ): AsyncGenerator<
    Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent,
    void,
    undefined
  > {
    yield* this.upstream.resubscribe(params, context);
  }
}
