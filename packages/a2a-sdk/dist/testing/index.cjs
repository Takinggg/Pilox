'use strict';

// src/testing/index.ts
var MockAgentExecutor = class {
  constructor(responseText = "Mock response") {
    this.responseText = responseText;
  }
  lastRequestContext;
  executionCount = 0;
  async execute(requestContext, eventBus) {
    this.lastRequestContext = requestContext;
    this.executionCount++;
    const responseMessage = {
      kind: "message",
      role: "agent",
      messageId: `mock-${this.executionCount}`,
      parts: [{ kind: "text", text: this.responseText }],
      taskId: requestContext.taskId,
      contextId: requestContext.contextId
    };
    eventBus.publish(responseMessage);
    eventBus.publish({
      kind: "status-update",
      taskId: requestContext.taskId,
      contextId: requestContext.contextId,
      status: {
        state: "completed",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      },
      final: true
    });
    eventBus.finished();
  }
  async cancelTask(taskId, eventBus) {
    eventBus.publish({
      kind: "status-update",
      taskId,
      contextId: "",
      status: {
        state: "canceled",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      },
      final: true
    });
    eventBus.finished();
  }
};
function createTestAgentCard(overrides = {}) {
  return {
    name: "test-agent",
    url: "http://localhost:3000",
    version: "1.0.0",
    capabilities: {
      streaming: false,
      pushNotifications: false
    },
    skills: [],
    ...overrides
  };
}

exports.MockAgentExecutor = MockAgentExecutor;
exports.createTestAgentCard = createTestAgentCard;
