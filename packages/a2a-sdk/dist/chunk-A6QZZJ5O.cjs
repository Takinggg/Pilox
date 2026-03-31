'use strict';

var chunkMTXDZYGP_cjs = require('./chunk-MTXDZYGP.cjs');
var chunkMA4BANAE_cjs = require('./chunk-MA4BANAE.cjs');
var chunkFEJHDJOG_cjs = require('./chunk-FEJHDJOG.cjs');
var chunkKXDUHV5G_cjs = require('./chunk-KXDUHV5G.cjs');
var chunkUCDQAHV2_cjs = require('./chunk-UCDQAHV2.cjs');
var chunk6NYM5ZKZ_cjs = require('./chunk-6NYM5ZKZ.cjs');
var uuid = require('uuid');
var zod = require('zod');

// src/core/server/agent_execution/request_context.ts
var RequestContext = class {
  userMessage;
  taskId;
  contextId;
  task;
  referenceTasks;
  context;
  constructor(userMessage, taskId, contextId, task, referenceTasks, context) {
    this.userMessage = userMessage;
    this.taskId = taskId;
    this.contextId = contextId;
    this.task = task;
    this.referenceTasks = referenceTasks;
    this.context = context;
  }
};

// src/core/server/events/execution_event_bus.ts
var CustomEventImpl = typeof CustomEvent !== "undefined" ? CustomEvent : class CustomEventPolyfill extends Event {
  detail;
  constructor(type, eventInitDict) {
    super(type, eventInitDict);
    this.detail = eventInitDict?.detail ?? null;
  }
};
function isAgentExecutionCustomEvent(e) {
  return e instanceof CustomEventImpl;
}
var DefaultExecutionEventBus = class extends EventTarget {
  // Separate storage for each event type - both use the interface's Listener type
  // but are invoked differently (with event payload vs. no arguments)
  eventListeners = /* @__PURE__ */ new Map();
  finishedListeners = /* @__PURE__ */ new Map();
  publish(event) {
    this.dispatchEvent(new CustomEventImpl("event", { detail: event }));
  }
  finished() {
    this.dispatchEvent(new Event("finished"));
  }
  /**
   * EventEmitter-compatible 'on' method.
   * Wraps the listener to extract event detail from CustomEvent.
   * Supports multiple registrations of the same listener (like EventEmitter).
   * @param eventName The event name to listen for.
   * @param listener The callback function to invoke when the event is emitted.
   * @returns This instance for method chaining.
   */
  on(eventName, listener) {
    if (eventName === "event") {
      this.addEventListenerInternal(listener);
    } else {
      this.addFinishedListenerInternal(listener);
    }
    return this;
  }
  /**
   * EventEmitter-compatible 'off' method.
   * Uses the stored wrapped listener for proper removal.
   * Removes at most one instance of a listener per call (like EventEmitter).
   * @param eventName The event name to stop listening for.
   * @param listener The callback function to remove.
   * @returns This instance for method chaining.
   */
  off(eventName, listener) {
    if (eventName === "event") {
      this.removeEventListenerInternal(listener);
    } else {
      this.removeFinishedListenerInternal(listener);
    }
    return this;
  }
  /**
   * EventEmitter-compatible 'once' method.
   * Listener is automatically removed after first invocation.
   * Supports multiple registrations of the same listener (like EventEmitter).
   * @param eventName The event name to listen for once.
   * @param listener The callback function to invoke when the event is emitted.
   * @returns This instance for method chaining.
   */
  once(eventName, listener) {
    if (eventName === "event") {
      this.addEventListenerOnceInternal(listener);
    } else {
      this.addFinishedListenerOnceInternal(listener);
    }
    return this;
  }
  /**
   * EventEmitter-compatible 'removeAllListeners' method.
   * Removes all listeners for a specific event or all events.
   * @param eventName Optional event name to remove listeners for. If omitted, removes all.
   * @returns This instance for method chaining.
   */
  removeAllListeners(eventName) {
    if (eventName === void 0 || eventName === "event") {
      for (const wrappedListeners of this.eventListeners.values()) {
        for (const wrapped of wrappedListeners) {
          this.removeEventListener("event", wrapped);
        }
      }
      this.eventListeners.clear();
    }
    if (eventName === void 0 || eventName === "finished") {
      for (const wrappedListeners of this.finishedListeners.values()) {
        for (const wrapped of wrappedListeners) {
          this.removeEventListener("finished", wrapped);
        }
      }
      this.finishedListeners.clear();
    }
    return this;
  }
  // ========================
  // Helper methods for listener tracking
  // ========================
  /**
   * Adds a wrapped listener to the tracking map.
   */
  trackListener(listenerMap, listener, wrapped) {
    const existing = listenerMap.get(listener);
    if (existing) {
      existing.push(wrapped);
    } else {
      listenerMap.set(listener, [wrapped]);
    }
  }
  /**
   * Removes a wrapped listener from the tracking map (for once cleanup).
   */
  untrackWrappedListener(listenerMap, listener, wrapped) {
    const wrappedList = listenerMap.get(listener);
    if (wrappedList && wrappedList.length > 0) {
      const index = wrappedList.indexOf(wrapped);
      if (index !== -1) {
        wrappedList.splice(index, 1);
        if (wrappedList.length === 0) {
          listenerMap.delete(listener);
        }
      }
    }
  }
  // ========================
  // Internal methods for 'event' listeners
  // ========================
  addEventListenerInternal(listener) {
    const wrapped = (e) => {
      if (!isAgentExecutionCustomEvent(e)) {
        throw new Error('Internal error: expected CustomEvent for "event" type');
      }
      listener.call(this, e.detail);
    };
    this.trackListener(this.eventListeners, listener, wrapped);
    this.addEventListener("event", wrapped);
  }
  removeEventListenerInternal(listener) {
    const wrappedList = this.eventListeners.get(listener);
    if (wrappedList && wrappedList.length > 0) {
      const wrapped = wrappedList.pop();
      if (wrappedList.length === 0) {
        this.eventListeners.delete(listener);
      }
      this.removeEventListener("event", wrapped);
    }
  }
  addEventListenerOnceInternal(listener) {
    const wrapped = (e) => {
      if (!isAgentExecutionCustomEvent(e)) {
        throw new Error('Internal error: expected CustomEvent for "event" type');
      }
      this.untrackWrappedListener(this.eventListeners, listener, wrapped);
      listener.call(this, e.detail);
    };
    this.trackListener(this.eventListeners, listener, wrapped);
    this.addEventListener("event", wrapped, { once: true });
  }
  // ========================
  // Internal methods for 'finished' listeners
  // ========================
  // The interface declares listeners as (event: AgentExecutionEvent) => void,
  // but for 'finished' events they are invoked with no arguments (EventEmitter behavior).
  // We use Function.prototype.call to invoke with `this` as the event bus (matching
  // EventEmitter semantics) and no arguments, which is type-safe.
  addFinishedListenerInternal(listener) {
    const wrapped = () => {
      listener.call(this);
    };
    this.trackListener(this.finishedListeners, listener, wrapped);
    this.addEventListener("finished", wrapped);
  }
  removeFinishedListenerInternal(listener) {
    const wrappedList = this.finishedListeners.get(listener);
    if (wrappedList && wrappedList.length > 0) {
      const wrapped = wrappedList.pop();
      if (wrappedList.length === 0) {
        this.finishedListeners.delete(listener);
      }
      this.removeEventListener("finished", wrapped);
    }
  }
  addFinishedListenerOnceInternal(listener) {
    const wrapped = () => {
      this.untrackWrappedListener(this.finishedListeners, listener, wrapped);
      listener.call(this);
    };
    this.trackListener(this.finishedListeners, listener, wrapped);
    this.addEventListener("finished", wrapped, { once: true });
  }
};

// src/core/server/events/execution_event_bus_manager.ts
var DefaultExecutionEventBusManager = class {
  taskIdToBus = /* @__PURE__ */ new Map();
  /**
   * Creates or retrieves an existing ExecutionEventBus based on the taskId.
   * @param taskId The ID of the task.
   * @returns An instance of ExecutionEventBus.
   */
  createOrGetByTaskId(taskId) {
    if (!this.taskIdToBus.has(taskId)) {
      this.taskIdToBus.set(taskId, new DefaultExecutionEventBus());
    }
    return this.taskIdToBus.get(taskId);
  }
  /**
   * Retrieves an existing ExecutionEventBus based on the taskId.
   * @param taskId The ID of the task.
   * @returns An instance of ExecutionEventBus or undefined if not found.
   */
  getByTaskId(taskId) {
    return this.taskIdToBus.get(taskId);
  }
  /**
   * Removes the event bus for a given taskId.
   * This should be called when an execution flow is complete to free resources.
   * @param taskId The ID of the task.
   */
  cleanupByTaskId(taskId) {
    const bus = this.taskIdToBus.get(taskId);
    if (bus) {
      bus.removeAllListeners();
    }
    this.taskIdToBus.delete(taskId);
  }
};

// src/core/server/events/execution_event_queue.ts
var ExecutionEventQueue = class {
  eventBus;
  eventQueue = [];
  resolvePromise;
  stopped = false;
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.eventBus.on("event", this.handleEvent);
    this.eventBus.on("finished", this.handleFinished);
  }
  handleEvent = (event) => {
    if (this.stopped) return;
    this.eventQueue.push(event);
    if (this.resolvePromise) {
      this.resolvePromise();
      this.resolvePromise = void 0;
    }
  };
  handleFinished = () => {
    this.stop();
  };
  /**
   * Provides an async generator that yields events from the event bus.
   * Stops when a Message event is received or a TaskStatusUpdateEvent with final=true is received.
   */
  async *events() {
    while (!this.stopped || this.eventQueue.length > 0) {
      if (this.eventQueue.length > 0) {
        const event = this.eventQueue.shift();
        yield event;
        if (event.kind === "message" || event.kind === "status-update" && event.final) {
          this.handleFinished();
          break;
        }
      } else if (!this.stopped) {
        await new Promise((resolve) => {
          this.resolvePromise = resolve;
        });
      }
    }
  }
  /**
   * Stops the event queue from processing further events.
   */
  stop() {
    this.stopped = true;
    if (this.resolvePromise) {
      this.resolvePromise();
      this.resolvePromise = void 0;
    }
    this.eventBus.off("event", this.handleEvent);
    this.eventBus.off("finished", this.handleFinished);
  }
};

// src/core/server/result_manager.ts
var ResultManager = class {
  taskStore;
  serverCallContext;
  currentTask;
  latestUserMessage;
  // To add to history if a new task is created
  finalMessageResult;
  // Stores the message if it's the final result
  constructor(taskStore, serverCallContext) {
    this.taskStore = taskStore;
    this.serverCallContext = serverCallContext;
  }
  setContext(latestUserMessage) {
    this.latestUserMessage = latestUserMessage;
  }
  /**
   * Processes an agent execution event and updates the task store.
   * @param event The agent execution event.
   */
  async processEvent(event) {
    if (event.kind === "message") {
      this.finalMessageResult = event;
    } else if (event.kind === "task") {
      const taskEvent = event;
      this.currentTask = { ...taskEvent };
      if (this.latestUserMessage) {
        if (!this.currentTask.history?.find(
          (msg) => msg.messageId === this.latestUserMessage.messageId
        )) {
          this.currentTask.history = [this.latestUserMessage, ...this.currentTask.history || []];
        }
      }
      await this.saveCurrentTask();
    } else if (event.kind === "status-update") {
      const updateEvent = event;
      if (this.currentTask && this.currentTask.id === updateEvent.taskId) {
        this.currentTask.status = updateEvent.status;
        if (updateEvent.status.message) {
          if (!this.currentTask.history?.find(
            (msg) => msg.messageId === updateEvent.status.message.messageId
          )) {
            this.currentTask.history = [
              ...this.currentTask.history || [],
              updateEvent.status.message
            ];
          }
        }
        await this.saveCurrentTask();
      } else if (!this.currentTask && updateEvent.taskId) {
        const loaded = await this.taskStore.load(updateEvent.taskId, this.serverCallContext);
        if (loaded) {
          this.currentTask = loaded;
          this.currentTask.status = updateEvent.status;
          if (updateEvent.status.message) {
            if (!this.currentTask.history?.find(
              (msg) => msg.messageId === updateEvent.status.message.messageId
            )) {
              this.currentTask.history = [
                ...this.currentTask.history || [],
                updateEvent.status.message
              ];
            }
          }
          await this.saveCurrentTask();
        } else {
          console.warn(
            `ResultManager: Received status update for unknown task ${updateEvent.taskId}`
          );
        }
      }
    } else if (event.kind === "artifact-update") {
      const artifactEvent = event;
      if (this.currentTask && this.currentTask.id === artifactEvent.taskId) {
        if (!this.currentTask.artifacts) {
          this.currentTask.artifacts = [];
        }
        const existingArtifactIndex = this.currentTask.artifacts.findIndex(
          (art) => art.artifactId === artifactEvent.artifact.artifactId
        );
        if (existingArtifactIndex !== -1) {
          if (artifactEvent.append) {
            const existingArtifact = this.currentTask.artifacts[existingArtifactIndex];
            existingArtifact.parts.push(...artifactEvent.artifact.parts);
            if (artifactEvent.artifact.description)
              existingArtifact.description = artifactEvent.artifact.description;
            if (artifactEvent.artifact.name) existingArtifact.name = artifactEvent.artifact.name;
            if (artifactEvent.artifact.metadata)
              existingArtifact.metadata = {
                ...existingArtifact.metadata,
                ...artifactEvent.artifact.metadata
              };
          } else {
            this.currentTask.artifacts[existingArtifactIndex] = artifactEvent.artifact;
          }
        } else {
          this.currentTask.artifacts.push(artifactEvent.artifact);
        }
        await this.saveCurrentTask();
      } else if (!this.currentTask && artifactEvent.taskId) {
        const loaded = await this.taskStore.load(artifactEvent.taskId, this.serverCallContext);
        if (loaded) {
          this.currentTask = loaded;
          if (!this.currentTask.artifacts) this.currentTask.artifacts = [];
          const existingArtifactIndex = this.currentTask.artifacts.findIndex(
            (art) => art.artifactId === artifactEvent.artifact.artifactId
          );
          if (existingArtifactIndex !== -1) {
            if (artifactEvent.append) {
              this.currentTask.artifacts[existingArtifactIndex].parts.push(
                ...artifactEvent.artifact.parts
              );
            } else {
              this.currentTask.artifacts[existingArtifactIndex] = artifactEvent.artifact;
            }
          } else {
            this.currentTask.artifacts.push(artifactEvent.artifact);
          }
          await this.saveCurrentTask();
        } else {
          console.warn(
            `ResultManager: Received artifact update for unknown task ${artifactEvent.taskId}`
          );
        }
      }
    }
  }
  async saveCurrentTask() {
    if (this.currentTask) {
      await this.taskStore.save(this.currentTask, this.serverCallContext);
    }
  }
  /**
   * Gets the final result, which could be a Message or a Task.
   * This should be called after the event stream has been fully processed.
   * @returns The final Message or the current Task.
   */
  getFinalResult() {
    if (this.finalMessageResult) {
      return this.finalMessageResult;
    }
    return this.currentTask;
  }
  /**
   * Gets the task currently being managed by this ResultManager instance.
   * This task could be one that was started with or one created during agent execution.
   * @returns The current Task or undefined if no task is active.
   */
  getCurrentTask() {
    return this.currentTask;
  }
};

// src/core/server/push_notification/push_notification_store.ts
var InMemoryPushNotificationStore = class {
  store = /* @__PURE__ */ new Map();
  async save(taskId, pushNotificationConfig) {
    const configs = this.store.get(taskId) || [];
    if (!pushNotificationConfig.id) {
      pushNotificationConfig.id = taskId;
    }
    const existingIndex = configs.findIndex((config) => config.id === pushNotificationConfig.id);
    if (existingIndex !== -1) {
      configs.splice(existingIndex, 1);
    }
    configs.push(pushNotificationConfig);
    this.store.set(taskId, configs);
  }
  async load(taskId) {
    const configs = this.store.get(taskId);
    return configs || [];
  }
  async delete(taskId, configId) {
    if (configId === void 0) {
      configId = taskId;
    }
    const configs = this.store.get(taskId);
    if (!configs) {
      return;
    }
    const configIndex = configs.findIndex((config) => config.id === configId);
    if (configIndex !== -1) {
      configs.splice(configIndex, 1);
    }
    if (configs.length === 0) {
      this.store.delete(taskId);
    } else {
      this.store.set(taskId, configs);
    }
  }
};

// src/core/server/push_notification/default_push_notification_sender.ts
var DefaultPushNotificationSender = class {
  pushNotificationStore;
  notificationChain;
  options;
  constructor(pushNotificationStore, options = {}) {
    this.pushNotificationStore = pushNotificationStore;
    this.notificationChain = /* @__PURE__ */ new Map();
    this.options = {
      timeout: 5e3,
      tokenHeaderName: "X-A2A-Notification-Token",
      ...options
    };
  }
  async send(task) {
    const pushConfigs = await this.pushNotificationStore.load(task.id);
    if (!pushConfigs || pushConfigs.length === 0) {
      return;
    }
    const lastPromise = this.notificationChain.get(task.id) ?? Promise.resolve();
    const newPromise = lastPromise.then(async () => {
      const dispatches = pushConfigs.map(async (pushConfig) => {
        try {
          await this._dispatchNotification(task, pushConfig);
        } catch (error) {
          console.error(
            `Error sending push notification for task_id=${task.id} to URL: ${pushConfig.url}. Error:`,
            error
          );
        }
      });
      await Promise.all(dispatches);
    });
    this.notificationChain.set(task.id, newPromise);
    return newPromise.finally(() => {
      if (this.notificationChain.get(task.id) === newPromise) {
        this.notificationChain.delete(task.id);
      }
    });
  }
  async _dispatchNotification(task, pushConfig) {
    const url = pushConfig.url;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);
    try {
      const headers = {
        "Content-Type": "application/json"
      };
      if (pushConfig.token) {
        headers[this.options.tokenHeaderName] = pushConfig.token;
      }
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(task),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      console.info(`Push notification sent for task_id=${task.id} to URL: ${url}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }
};
var terminalStates = ["completed", "failed", "canceled", "rejected"];
var DefaultRequestHandler = class {
  agentCard;
  taskStore;
  agentExecutor;
  eventBusManager;
  pushNotificationStore;
  pushNotificationSender;
  extendedAgentCardProvider;
  constructor(agentCard, taskStore, agentExecutor, eventBusManager = new DefaultExecutionEventBusManager(), pushNotificationStore, pushNotificationSender, extendedAgentCardProvider) {
    this.agentCard = agentCard;
    this.taskStore = taskStore;
    this.agentExecutor = agentExecutor;
    this.eventBusManager = eventBusManager;
    this.extendedAgentCardProvider = extendedAgentCardProvider;
    if (agentCard.capabilities.pushNotifications) {
      this.pushNotificationStore = pushNotificationStore || new InMemoryPushNotificationStore();
      this.pushNotificationSender = pushNotificationSender || new DefaultPushNotificationSender(this.pushNotificationStore);
    }
  }
  async getAgentCard() {
    return this.agentCard;
  }
  async getAuthenticatedExtendedAgentCard(context) {
    if (!this.agentCard.supportsAuthenticatedExtendedCard) {
      throw chunk6NYM5ZKZ_cjs.A2AError.unsupportedOperation("Agent does not support authenticated extended card.");
    }
    if (!this.extendedAgentCardProvider) {
      throw chunk6NYM5ZKZ_cjs.A2AError.authenticatedExtendedCardNotConfigured();
    }
    if (typeof this.extendedAgentCardProvider === "function") {
      return this.extendedAgentCardProvider(context);
    }
    if (context?.user?.isAuthenticated) {
      return this.extendedAgentCardProvider;
    }
    return this.agentCard;
  }
  async _createRequestContext(incomingMessage, context) {
    let task;
    let referenceTasks;
    if (incomingMessage.taskId) {
      task = await this.taskStore.load(incomingMessage.taskId, context);
      if (!task) {
        throw chunk6NYM5ZKZ_cjs.A2AError.taskNotFound(incomingMessage.taskId);
      }
      if (terminalStates.includes(task.status.state)) {
        throw chunk6NYM5ZKZ_cjs.A2AError.invalidRequest(
          `Task ${task.id} is in a terminal state (${task.status.state}) and cannot be modified.`
        );
      }
      task.history = [...task.history || [], incomingMessage];
      await this.taskStore.save(task, context);
    }
    const taskId = incomingMessage.taskId || uuid.v4();
    if (incomingMessage.referenceTaskIds && incomingMessage.referenceTaskIds.length > 0) {
      referenceTasks = [];
      for (const refId of incomingMessage.referenceTaskIds) {
        const refTask = await this.taskStore.load(refId, context);
        if (refTask) {
          referenceTasks.push(refTask);
        } else {
          console.warn(`Reference task ${refId} not found.`);
        }
      }
    }
    const contextId = incomingMessage.contextId || task?.contextId || uuid.v4();
    if (context?.requestedExtensions) {
      const agentCard = await this.getAgentCard();
      const exposedExtensions = new Set(
        agentCard.capabilities.extensions?.map((ext) => ext.uri) || []
      );
      const validExtensions = context.requestedExtensions.filter(
        (extension) => exposedExtensions.has(extension)
      );
      context = new chunkUCDQAHV2_cjs.ServerCallContext(validExtensions, context.user);
    }
    const messageForContext = {
      ...incomingMessage,
      contextId,
      taskId
    };
    return new RequestContext(messageForContext, taskId, contextId, task, referenceTasks, context);
  }
  async _processEvents(taskId, resultManager, eventQueue, context, options) {
    let firstResultSent = false;
    try {
      for await (const event of eventQueue.events()) {
        await resultManager.processEvent(event);
        try {
          await this._sendPushNotificationIfNeeded(event, context);
        } catch (error) {
          console.error(`Error sending push notification: ${error}`);
        }
        if (options?.firstResultResolver && !firstResultSent) {
          let firstResult;
          if (event.kind === "message") {
            firstResult = event;
          } else {
            firstResult = resultManager.getCurrentTask();
          }
          if (firstResult) {
            options.firstResultResolver(firstResult);
            firstResultSent = true;
          }
        }
      }
      if (options?.firstResultRejector && !firstResultSent) {
        options.firstResultRejector(
          chunk6NYM5ZKZ_cjs.A2AError.internalError("Execution finished before a message or task was produced.")
        );
      }
    } catch (error) {
      console.error(`Event processing loop failed for task ${taskId}:`, error);
      this._handleProcessingError(
        error,
        resultManager,
        firstResultSent,
        taskId,
        options?.firstResultRejector
      );
    } finally {
      this.eventBusManager.cleanupByTaskId(taskId);
    }
  }
  async sendMessage(params, context) {
    const incomingMessage = params.message;
    if (!incomingMessage.messageId) {
      throw chunk6NYM5ZKZ_cjs.A2AError.invalidParams("message.messageId is required.");
    }
    const isBlocking = params.configuration?.blocking !== false;
    const resultManager = new ResultManager(this.taskStore, context);
    resultManager.setContext(incomingMessage);
    const requestContext = await this._createRequestContext(incomingMessage, context);
    const taskId = requestContext.taskId;
    const finalMessageForAgent = requestContext.userMessage;
    if (params.configuration?.pushNotificationConfig && this.agentCard.capabilities.pushNotifications) {
      await this.pushNotificationStore?.save(taskId, params.configuration.pushNotificationConfig);
    }
    const eventBus = this.eventBusManager.createOrGetByTaskId(taskId);
    const eventQueue = new ExecutionEventQueue(eventBus);
    this.agentExecutor.execute(requestContext, eventBus).catch((err) => {
      console.error(`Agent execution failed for message ${finalMessageForAgent.messageId}:`, err);
      const errorTask = {
        id: requestContext.task?.id || uuid.v4(),
        // Use existing task ID or generate new
        contextId: finalMessageForAgent.contextId,
        status: {
          state: "failed",
          message: {
            kind: "message",
            role: "agent",
            messageId: uuid.v4(),
            parts: [{ kind: "text", text: `Agent execution error: ${err.message}` }],
            taskId: requestContext.task?.id,
            contextId: finalMessageForAgent.contextId
          },
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        },
        history: requestContext.task?.history ? [...requestContext.task.history] : [],
        kind: "task"
      };
      if (finalMessageForAgent) {
        if (!errorTask.history?.find((m) => m.messageId === finalMessageForAgent.messageId)) {
          errorTask.history?.push(finalMessageForAgent);
        }
      }
      eventBus.publish(errorTask);
      eventBus.publish({
        // And publish a final status update
        kind: "status-update",
        taskId: errorTask.id,
        contextId: errorTask.contextId,
        status: errorTask.status,
        final: true
      });
      eventBus.finished();
    });
    if (isBlocking) {
      await this._processEvents(taskId, resultManager, eventQueue, context);
      const finalResult = resultManager.getFinalResult();
      if (!finalResult) {
        throw chunk6NYM5ZKZ_cjs.A2AError.internalError(
          "Agent execution finished without a result, and no task context found."
        );
      }
      return finalResult;
    } else {
      return new Promise((resolve, reject) => {
        this._processEvents(taskId, resultManager, eventQueue, context, {
          firstResultResolver: resolve,
          firstResultRejector: reject
        });
      });
    }
  }
  async *sendMessageStream(params, context) {
    const incomingMessage = params.message;
    if (!incomingMessage.messageId) {
      throw chunk6NYM5ZKZ_cjs.A2AError.invalidParams("message.messageId is required for streaming.");
    }
    const resultManager = new ResultManager(this.taskStore, context);
    resultManager.setContext(incomingMessage);
    const requestContext = await this._createRequestContext(incomingMessage, context);
    const taskId = requestContext.taskId;
    const finalMessageForAgent = requestContext.userMessage;
    const eventBus = this.eventBusManager.createOrGetByTaskId(taskId);
    const eventQueue = new ExecutionEventQueue(eventBus);
    if (params.configuration?.pushNotificationConfig && this.agentCard.capabilities.pushNotifications) {
      await this.pushNotificationStore?.save(taskId, params.configuration.pushNotificationConfig);
    }
    this.agentExecutor.execute(requestContext, eventBus).catch((err) => {
      console.error(
        `Agent execution failed for stream message ${finalMessageForAgent.messageId}:`,
        err
      );
      const errorTaskStatus = {
        kind: "status-update",
        taskId: requestContext.task?.id || uuid.v4(),
        // Use existing or a placeholder
        contextId: finalMessageForAgent.contextId,
        status: {
          state: "failed",
          message: {
            kind: "message",
            role: "agent",
            messageId: uuid.v4(),
            parts: [{ kind: "text", text: `Agent execution error: ${err.message}` }],
            taskId: requestContext.task?.id,
            contextId: finalMessageForAgent.contextId
          },
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        },
        final: true
        // This will terminate the stream for the client
      };
      eventBus.publish(errorTaskStatus);
    });
    try {
      for await (const event of eventQueue.events()) {
        await resultManager.processEvent(event);
        await this._sendPushNotificationIfNeeded(event, context);
        yield event;
      }
    } finally {
      this.eventBusManager.cleanupByTaskId(taskId);
    }
  }
  async getTask(params, context) {
    const task = await this.taskStore.load(params.id, context);
    if (!task) {
      throw chunk6NYM5ZKZ_cjs.A2AError.taskNotFound(params.id);
    }
    if (params.historyLength !== void 0 && params.historyLength >= 0) {
      if (task.history) {
        task.history = task.history.slice(-params.historyLength);
      }
    } else {
      task.history = [];
    }
    return task;
  }
  async cancelTask(params, context) {
    const task = await this.taskStore.load(params.id, context);
    if (!task) {
      throw chunk6NYM5ZKZ_cjs.A2AError.taskNotFound(params.id);
    }
    const nonCancelableStates = ["completed", "failed", "canceled", "rejected"];
    if (nonCancelableStates.includes(task.status.state)) {
      throw chunk6NYM5ZKZ_cjs.A2AError.taskNotCancelable(params.id);
    }
    const eventBus = this.eventBusManager.getByTaskId(params.id);
    if (eventBus) {
      const eventQueue = new ExecutionEventQueue(eventBus);
      await this.agentExecutor.cancelTask(params.id, eventBus);
      await this._processEvents(
        params.id,
        new ResultManager(this.taskStore, context),
        eventQueue,
        context
      );
    } else {
      task.status = {
        state: "canceled",
        message: {
          // Optional: Add a system message indicating cancellation
          kind: "message",
          role: "agent",
          messageId: uuid.v4(),
          parts: [{ kind: "text", text: "Task cancellation requested by user." }],
          taskId: task.id,
          contextId: task.contextId
        },
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      task.history = [...task.history || [], task.status.message];
      await this.taskStore.save(task, context);
    }
    const latestTask = await this.taskStore.load(params.id, context);
    if (!latestTask) {
      throw chunk6NYM5ZKZ_cjs.A2AError.internalError(`Task ${params.id} not found after cancellation.`);
    }
    if (latestTask.status.state != "canceled") {
      throw chunk6NYM5ZKZ_cjs.A2AError.taskNotCancelable(params.id);
    }
    return latestTask;
  }
  async setTaskPushNotificationConfig(params, context) {
    if (!this.agentCard.capabilities.pushNotifications) {
      throw chunk6NYM5ZKZ_cjs.A2AError.pushNotificationNotSupported();
    }
    const task = await this.taskStore.load(params.taskId, context);
    if (!task) {
      throw chunk6NYM5ZKZ_cjs.A2AError.taskNotFound(params.taskId);
    }
    const { taskId, pushNotificationConfig } = params;
    if (!pushNotificationConfig.id) {
      pushNotificationConfig.id = taskId;
    }
    await this.pushNotificationStore?.save(taskId, pushNotificationConfig);
    return params;
  }
  async getTaskPushNotificationConfig(params, context) {
    if (!this.agentCard.capabilities.pushNotifications) {
      throw chunk6NYM5ZKZ_cjs.A2AError.pushNotificationNotSupported();
    }
    const task = await this.taskStore.load(params.id, context);
    if (!task) {
      throw chunk6NYM5ZKZ_cjs.A2AError.taskNotFound(params.id);
    }
    const configs = await this.pushNotificationStore?.load(params.id) || [];
    if (configs.length === 0) {
      throw chunk6NYM5ZKZ_cjs.A2AError.internalError(`Push notification config not found for task ${params.id}.`);
    }
    let configId;
    if ("pushNotificationConfigId" in params && params.pushNotificationConfigId) {
      configId = params.pushNotificationConfigId;
    } else {
      configId = params.id;
    }
    const config = configs.find((c) => c.id === configId);
    if (!config) {
      throw chunk6NYM5ZKZ_cjs.A2AError.internalError(
        `Push notification config with id '${configId}' not found for task ${params.id}.`
      );
    }
    return { taskId: params.id, pushNotificationConfig: config };
  }
  async listTaskPushNotificationConfigs(params, context) {
    if (!this.agentCard.capabilities.pushNotifications) {
      throw chunk6NYM5ZKZ_cjs.A2AError.pushNotificationNotSupported();
    }
    const task = await this.taskStore.load(params.id, context);
    if (!task) {
      throw chunk6NYM5ZKZ_cjs.A2AError.taskNotFound(params.id);
    }
    const configs = await this.pushNotificationStore?.load(params.id) || [];
    return configs.map((config) => ({
      taskId: params.id,
      pushNotificationConfig: config
    }));
  }
  async deleteTaskPushNotificationConfig(params, context) {
    if (!this.agentCard.capabilities.pushNotifications) {
      throw chunk6NYM5ZKZ_cjs.A2AError.pushNotificationNotSupported();
    }
    const task = await this.taskStore.load(params.id, context);
    if (!task) {
      throw chunk6NYM5ZKZ_cjs.A2AError.taskNotFound(params.id);
    }
    const { id: taskId, pushNotificationConfigId } = params;
    await this.pushNotificationStore?.delete(taskId, pushNotificationConfigId);
  }
  async *resubscribe(params, context) {
    if (!this.agentCard.capabilities.streaming) {
      throw chunk6NYM5ZKZ_cjs.A2AError.unsupportedOperation("Streaming (and thus resubscription) is not supported.");
    }
    const task = await this.taskStore.load(params.id, context);
    if (!task) {
      throw chunk6NYM5ZKZ_cjs.A2AError.taskNotFound(params.id);
    }
    yield task;
    const finalStates = ["completed", "failed", "canceled", "rejected"];
    if (finalStates.includes(task.status.state)) {
      return;
    }
    const eventBus = this.eventBusManager.getByTaskId(params.id);
    if (!eventBus) {
      console.warn(`Resubscribe: No active event bus for task ${params.id}.`);
      return;
    }
    const eventQueue = new ExecutionEventQueue(eventBus);
    try {
      for await (const event of eventQueue.events()) {
        if (event.kind === "status-update" && event.taskId === params.id) {
          yield event;
        } else if (event.kind === "artifact-update" && event.taskId === params.id) {
          yield event;
        } else if (event.kind === "task" && event.id === params.id) {
          yield event;
        }
      }
    } finally {
      eventQueue.stop();
    }
  }
  async _sendPushNotificationIfNeeded(event, context) {
    if (!this.agentCard.capabilities.pushNotifications) {
      return;
    }
    let taskId = "";
    if (event.kind == "task") {
      const task2 = event;
      taskId = task2.id;
    } else {
      taskId = event.taskId;
    }
    if (!taskId) {
      console.error(`Task ID not found for event ${event.kind}.`);
      return;
    }
    const task = await this.taskStore.load(taskId, context);
    if (!task) {
      console.error(`Task ${taskId} not found.`);
      return;
    }
    this.pushNotificationSender?.send(task);
  }
  async _handleProcessingError(error, resultManager, firstResultSent, taskId, firstResultRejector) {
    if (firstResultRejector && !firstResultSent) {
      firstResultRejector(error);
      return;
    }
    if (!firstResultRejector) {
      throw error;
    }
    const currentTask = resultManager.getCurrentTask();
    const errorMessage = error instanceof Error && error.message || "Unknown error";
    if (currentTask) {
      const statusUpdateFailed = {
        taskId: currentTask.id,
        contextId: currentTask.contextId,
        status: {
          state: "failed",
          message: {
            kind: "message",
            role: "agent",
            messageId: uuid.v4(),
            parts: [{ kind: "text", text: `Event processing loop failed: ${errorMessage}` }],
            taskId: currentTask.id,
            contextId: currentTask.contextId
          },
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        },
        kind: "status-update",
        final: true
      };
      try {
        await resultManager.processEvent(statusUpdateFailed);
      } catch (error2) {
        console.error(
          `Event processing loop failed for task ${taskId}: ${error2 instanceof Error && error2.message || "Unknown error"}`
        );
      }
    } else {
      console.error(`Event processing loop failed for task ${taskId}: ${errorMessage}`);
    }
  }
};

// src/core/server/store.ts
var InMemoryTaskStore = class {
  store = /* @__PURE__ */ new Map();
  async load(taskId) {
    const entry = this.store.get(taskId);
    return entry ? { ...entry } : void 0;
  }
  async save(task) {
    this.store.set(task.id, { ...task });
  }
};

// src/server/hive-request-handler.ts
var HiveRequestHandler = class {
  constructor(upstream, agentCard, middlewares) {
    this.upstream = upstream;
    this.agentCard = agentCard;
    this.pipeline = chunkKXDUHV5G_cjs.compose(middlewares);
  }
  pipeline;
  async getAgentCard() {
    return this.upstream.getAgentCard();
  }
  async getAuthenticatedExtendedAgentCard(context) {
    return this.upstream.getAuthenticatedExtendedAgentCard(context);
  }
  async sendMessage(params, context) {
    const ctx = chunkKXDUHV5G_cjs.createServerContext("message/send", params, this.agentCard);
    ctx.message = params.message;
    await this.pipeline(ctx, async () => {
      ctx.response = await this.upstream.sendMessage(
        ctx.params,
        context
      );
    });
    if (ctx.error) throw ctx.error;
    return ctx.response;
  }
  async *sendMessageStream(params, context) {
    const ctx = chunkKXDUHV5G_cjs.createServerContext("message/stream", params, this.agentCard);
    ctx.message = params.message;
    await this.pipeline(ctx, async () => {
    });
    if (ctx.error) throw ctx.error;
    yield* this.upstream.sendMessageStream(
      ctx.params,
      context
    );
  }
  async getTask(params, context) {
    const ctx = chunkKXDUHV5G_cjs.createServerContext("tasks/get", params, this.agentCard);
    await this.pipeline(ctx, async () => {
      ctx.response = await this.upstream.getTask(
        ctx.params,
        context
      );
    });
    if (ctx.error) throw ctx.error;
    return ctx.response;
  }
  async cancelTask(params, context) {
    const ctx = chunkKXDUHV5G_cjs.createServerContext("tasks/cancel", params, this.agentCard);
    await this.pipeline(ctx, async () => {
      ctx.response = await this.upstream.cancelTask(
        ctx.params,
        context
      );
    });
    if (ctx.error) throw ctx.error;
    return ctx.response;
  }
  async setTaskPushNotificationConfig(params, context) {
    return this.upstream.setTaskPushNotificationConfig(params, context);
  }
  async getTaskPushNotificationConfig(params, context) {
    return this.upstream.getTaskPushNotificationConfig(params, context);
  }
  async listTaskPushNotificationConfigs(params, context) {
    return this.upstream.listTaskPushNotificationConfigs(params, context);
  }
  async deleteTaskPushNotificationConfig(params, context) {
    return this.upstream.deleteTaskPushNotificationConfig(params, context);
  }
  async *resubscribe(params, context) {
    yield* this.upstream.resubscribe(params, context);
  }
};

// src/config/defaults.ts
var DEFAULT_SCHEMA = {
  mode: "strict"};
var DEFAULT_RATE_LIMIT = {
  maxRequests: 100,
  windowMs: 6e4,
  strategy: "agent-id"
};
var DEFAULT_CIRCUIT_BREAKER = {
  failureThreshold: 5,
  resetTimeoutMs: 3e4,
  halfOpenSuccessThreshold: 2
};
var DEFAULT_AUDIT = {
  // store will default to InMemoryAuditStore when not provided
};
var PartSchema = zod.z.discriminatedUnion("kind", [
  zod.z.object({ kind: zod.z.literal("text"), text: zod.z.string() }).passthrough(),
  zod.z.object({ kind: zod.z.literal("file") }).passthrough(),
  zod.z.object({ kind: zod.z.literal("data"), data: zod.z.record(zod.z.unknown()) }).passthrough()
]);
var MessageSchema = zod.z.object({
  kind: zod.z.literal("message"),
  role: zod.z.enum(["user", "agent"]),
  messageId: zod.z.string(),
  parts: zod.z.array(PartSchema).min(1),
  taskId: zod.z.string().optional(),
  contextId: zod.z.string().optional(),
  referenceTaskIds: zod.z.array(zod.z.string()).optional(),
  extensions: zod.z.array(zod.z.string()).optional()
}).passthrough();
var MessageSendParamsSchema = zod.z.object({
  message: MessageSchema,
  configuration: zod.z.object({
    blocking: zod.z.boolean().optional(),
    acceptedOutputModes: zod.z.array(zod.z.string()).optional(),
    pushNotificationConfig: zod.z.unknown().optional(),
    historyLength: zod.z.number().optional()
  }).passthrough().optional()
}).passthrough();
var TaskQueryParamsSchema = zod.z.object({
  id: zod.z.string(),
  historyLength: zod.z.number().optional()
}).passthrough();
var TaskIdParamsSchema = zod.z.object({
  id: zod.z.string()
}).passthrough();
var METHOD_SCHEMAS = {
  "message/send": MessageSendParamsSchema,
  "message/stream": MessageSendParamsSchema,
  "tasks/get": TaskQueryParamsSchema,
  "tasks/cancel": TaskIdParamsSchema,
  "tasks/resubscribe": TaskIdParamsSchema
};

// src/security/schema/validator.ts
function createSchemaMiddleware(config = {}) {
  const mode = config.mode ?? "strict";
  return {
    name: "hive:schema-validation",
    priority: 400,
    enabled: mode !== "off",
    execute: async (ctx, next) => {
      const schema = METHOD_SCHEMAS[ctx.method];
      if (schema) {
        const result = schema.safeParse(ctx.params);
        if (!result.success) {
          const errorMsg = `Schema validation failed for ${ctx.method}: ${result.error.message}`;
          if (mode === "strict") {
            ctx.error = new Error(errorMsg);
            return;
          }
          console.warn(`[hive:schema] ${errorMsg}`);
        }
      }
      await next();
    }
  };
}

// src/security/rate-limit/token-bucket.ts
var TokenBucket = class {
  maxRequests;
  windowMs;
  buckets = /* @__PURE__ */ new Map();
  constructor(config = {}) {
    this.maxRequests = config.maxRequests ?? 100;
    this.windowMs = config.windowMs ?? 6e4;
  }
  /**
   * Check if a request from the given key is allowed.
   * Consumes one token if allowed.
   */
  consume(key) {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.maxRequests, lastRefill: now };
      this.buckets.set(key, bucket);
    }
    const elapsed = now - bucket.lastRefill;
    const refillRate = this.maxRequests / this.windowMs;
    const refill = elapsed * refillRate;
    bucket.tokens = Math.min(this.maxRequests, bucket.tokens + refill);
    bucket.lastRefill = now;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        retryAfterMs: 0,
        limit: this.maxRequests
      };
    }
    const deficit = 1 - bucket.tokens;
    const retryAfterMs = Math.ceil(deficit / refillRate);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs,
      limit: this.maxRequests
    };
  }
  /** Reset a specific key's bucket */
  reset(key) {
    this.buckets.delete(key);
  }
  /** Clear all buckets */
  clear() {
    this.buckets.clear();
  }
};

// src/server/middlewares/rate-limit.ts
function createRateLimitMiddleware(config) {
  const bucket = new TokenBucket(config);
  const strategy = config.strategy ?? "agent-id";
  return {
    name: "hive:rate-limit",
    priority: 200,
    enabled: true,
    execute: async (ctx, next) => {
      const key = strategy === "agent-id" ? ctx.remoteAgentCard?.name ?? ctx.requestId : ctx.requestId;
      const result = bucket.consume(key);
      if (!result.allowed) {
        ctx.error = new Error(
          `Rate limit exceeded for ${key}. Retry after ${result.retryAfterMs}ms`
        );
        return;
      }
      await next();
    }
  };
}

// src/security/circuit-breaker/breaker.ts
var CircuitBreaker = class {
  constructor(agentId, config = {}) {
    this.agentId = agentId;
    this.failureThreshold = config.failureThreshold ?? 5;
    this.resetTimeoutMs = config.resetTimeoutMs ?? 3e4;
    this.halfOpenSuccessThreshold = config.halfOpenSuccessThreshold ?? 2;
    this.onStateChange = config.onStateChange;
  }
  state = "closed";
  failures = 0;
  successes = 0;
  lastFailureTime = 0;
  failureThreshold;
  resetTimeoutMs;
  halfOpenSuccessThreshold;
  onStateChange;
  /** Check if request should be allowed through */
  canExecute() {
    if (this.state === "closed") return true;
    if (this.state === "open") {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.resetTimeoutMs) {
        this.transition("half-open");
        return true;
      }
      return false;
    }
    return true;
  }
  /** Record a successful request */
  recordSuccess() {
    if (this.state === "half-open") {
      this.successes++;
      if (this.successes >= this.halfOpenSuccessThreshold) {
        this.transition("closed");
      }
    }
    if (this.state === "closed") {
      this.failures = 0;
    }
  }
  /** Record a failed request */
  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.state === "half-open") {
      this.transition("open");
      return;
    }
    if (this.state === "closed" && this.failures >= this.failureThreshold) {
      this.transition("open");
    }
  }
  getState() {
    return this.state;
  }
  getAgentId() {
    return this.agentId;
  }
  transition(to) {
    const from = this.state;
    this.state = to;
    this.successes = 0;
    if (to === "closed") {
      this.failures = 0;
    }
    this.onStateChange?.(this.agentId, from, to);
  }
};

// src/security/circuit-breaker/registry.ts
var CircuitBreakerRegistry = class {
  constructor(config = {}) {
    this.config = config;
  }
  breakers = /* @__PURE__ */ new Map();
  /** Get or create a circuit breaker for the given agent ID */
  getOrCreate(agentId) {
    let breaker = this.breakers.get(agentId);
    if (!breaker) {
      breaker = new CircuitBreaker(agentId, this.config);
      this.breakers.set(agentId, breaker);
    }
    return breaker;
  }
  /** Remove a breaker for an agent */
  remove(agentId) {
    this.breakers.delete(agentId);
  }
  /** Clear all breakers */
  clear() {
    this.breakers.clear();
  }
};

// src/server/middlewares/circuit-breaker.ts
function createCircuitBreakerMiddleware(config) {
  const registry = new CircuitBreakerRegistry(config);
  return {
    name: "hive:circuit-breaker",
    priority: 300,
    enabled: true,
    execute: async (ctx, next) => {
      const agentId = ctx.remoteAgentCard?.name ?? "unknown";
      const breaker = registry.getOrCreate(agentId);
      if (!breaker.canExecute()) {
        ctx.error = new Error(
          `Circuit breaker open for agent ${agentId}. Request rejected.`
        );
        return;
      }
      try {
        await next();
        if (!ctx.error) {
          breaker.recordSuccess();
        } else {
          breaker.recordFailure();
        }
      } catch (err) {
        breaker.recordFailure();
        throw err;
      }
    }
  };
}

// src/server/middlewares/audit.ts
function createAuditMiddleware(config) {
  const store = config.store ?? new chunkMTXDZYGP_cjs.InMemoryAuditStore();
  let chainPromise;
  function getChain() {
    if (!chainPromise) {
      chainPromise = chunkMTXDZYGP_cjs.HashChain.fromStore(store);
    }
    return chainPromise;
  }
  return {
    name: "hive:audit",
    priority: 100,
    enabled: true,
    execute: async (ctx, next) => {
      const chain = await getChain();
      const agentId = ctx.remoteAgentCard?.name ?? "unknown";
      const taskId = extractTaskId(ctx) ?? ctx.requestId;
      await chain.append(agentId, taskId, `${ctx.method}.received`, {
        requestId: ctx.requestId
      });
      const start = Date.now();
      try {
        await next();
      } finally {
        const durationMs = Date.now() - start;
        const action = ctx.error ? `${ctx.method}.error` : `${ctx.method}.completed`;
        await chain.append(agentId, taskId, action, {
          requestId: ctx.requestId,
          durationMs,
          error: ctx.error?.message
        });
      }
    }
  };
}
function extractTaskId(ctx) {
  const params = ctx.params;
  if (!params) return void 0;
  const message = params["message"];
  if (message?.["taskId"]) return String(message["taskId"]);
  if (params["id"]) return String(params["id"]);
  return void 0;
}

// src/server/hive-server.ts
var HiveA2AServer = class {
  handler;
  agentCard;
  constructor(config) {
    const taskStore = config.taskStore ?? new InMemoryTaskStore();
    const middlewares = [];
    let enhancedCard = config.agentCard;
    const signingKeyPair = config.signing !== false ? config.signing?.keyPair ?? chunkMA4BANAE_cjs.generateSigningKeyPair() : void 0;
    const noiseKeyPair = config.noise !== false ? config.noise?.staticKeyPair ?? chunkMA4BANAE_cjs.generateNoiseKeyPair() : void 0;
    enhancedCard = chunkFEJHDJOG_cjs.addHiveExtensions(
      enhancedCard,
      noiseKeyPair?.publicKey,
      signingKeyPair?.publicKey
    );
    this.agentCard = enhancedCard;
    if (config.audit !== false) {
      middlewares.push(createAuditMiddleware(config.audit ?? DEFAULT_AUDIT));
    }
    if (config.rateLimit !== false) {
      const rlConfig = config.rateLimit === void 0 ? DEFAULT_RATE_LIMIT : config.rateLimit;
      middlewares.push(createRateLimitMiddleware(rlConfig));
    }
    if (config.circuitBreaker !== false) {
      const cbConfig = config.circuitBreaker === void 0 ? DEFAULT_CIRCUIT_BREAKER : config.circuitBreaker;
      middlewares.push(createCircuitBreakerMiddleware(cbConfig));
    }
    if (config.schemaEnforcement !== false) {
      const schemaConfig = config.schemaEnforcement === void 0 ? DEFAULT_SCHEMA : config.schemaEnforcement;
      middlewares.push(createSchemaMiddleware(schemaConfig));
    }
    if (config.middleware) {
      middlewares.push(...config.middleware);
    }
    const upstreamHandler = new DefaultRequestHandler(
      enhancedCard,
      taskStore,
      config.agentExecutor
    );
    this.handler = new HiveRequestHandler(upstreamHandler, enhancedCard, middlewares);
  }
};

exports.DefaultExecutionEventBus = DefaultExecutionEventBus;
exports.DefaultExecutionEventBusManager = DefaultExecutionEventBusManager;
exports.DefaultPushNotificationSender = DefaultPushNotificationSender;
exports.DefaultRequestHandler = DefaultRequestHandler;
exports.ExecutionEventQueue = ExecutionEventQueue;
exports.HiveA2AServer = HiveA2AServer;
exports.HiveRequestHandler = HiveRequestHandler;
exports.InMemoryPushNotificationStore = InMemoryPushNotificationStore;
exports.InMemoryTaskStore = InMemoryTaskStore;
exports.RequestContext = RequestContext;
exports.ResultManager = ResultManager;
