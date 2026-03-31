'use strict';

// src/core/constants.ts
var AGENT_CARD_PATH = ".well-known/agent-card.json";
var HTTP_EXTENSION_HEADER = "X-A2A-Extensions";

// src/core/errors.ts
var A2A_ERROR_CODE = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  TASK_NOT_FOUND: -32001,
  TASK_NOT_CANCELABLE: -32002,
  PUSH_NOTIFICATION_NOT_SUPPORTED: -32003,
  UNSUPPORTED_OPERATION: -32004,
  CONTENT_TYPE_NOT_SUPPORTED: -32005,
  INVALID_AGENT_RESPONSE: -32006,
  AUTHENTICATED_EXTENDED_CARD_NOT_CONFIGURED: -32007
};
var TaskNotFoundError = class extends Error {
  constructor(message) {
    super(message ?? "Task not found");
    this.name = "TaskNotFoundError";
  }
};
var TaskNotCancelableError = class extends Error {
  constructor(message) {
    super(message ?? "Task cannot be canceled");
    this.name = "TaskNotCancelableError";
  }
};
var PushNotificationNotSupportedError = class extends Error {
  constructor(message) {
    super(message ?? "Push Notification is not supported");
    this.name = "PushNotificationNotSupportedError";
  }
};
var UnsupportedOperationError = class extends Error {
  constructor(message) {
    super(message ?? "This operation is not supported");
    this.name = "UnsupportedOperationError";
  }
};
var ContentTypeNotSupportedError = class extends Error {
  constructor(message) {
    super(message ?? "Incompatible content types");
    this.name = "ContentTypeNotSupportedError";
  }
};
var InvalidAgentResponseError = class extends Error {
  constructor(message) {
    super(message ?? "Invalid agent response type");
    this.name = "InvalidAgentResponseError";
  }
};
var AuthenticatedExtendedCardNotConfiguredError = class extends Error {
  constructor(message) {
    super(message ?? "Authenticated Extended Card not configured");
    this.name = "AuthenticatedExtendedCardNotConfiguredError";
  }
};

// src/core/sse_utils.ts
var SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no"
  // Disable buffering in nginx
};
function formatSSEEvent(event) {
  return `data: ${JSON.stringify(event)}

`;
}
function formatSSEErrorEvent(error) {
  return `event: error
data: ${JSON.stringify(error)}

`;
}
async function* parseSseStream(response) {
  if (!response.body) {
    throw new Error("SSE response body is undefined. Cannot read stream.");
  }
  let buffer = "";
  let eventType = "message";
  let eventData = "";
  const stream = response.body.pipeThrough(new TextDecoderStream());
  for await (const value of readFrom(stream)) {
    buffer += value;
    let lineEndIndex;
    while ((lineEndIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.substring(0, lineEndIndex).trim();
      buffer = buffer.substring(lineEndIndex + 1);
      if (line === "") {
        if (eventData) {
          yield { type: eventType, data: eventData };
          eventData = "";
          eventType = "message";
        }
      } else if (line.startsWith("event:")) {
        eventType = line.substring("event:".length).trim();
      } else if (line.startsWith("data:")) {
        eventData = line.substring("data:".length).trim();
      }
    }
  }
  if (eventData) {
    yield { type: eventType, data: eventData };
  }
}
async function* readFrom(stream) {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

exports.A2A_ERROR_CODE = A2A_ERROR_CODE;
exports.AGENT_CARD_PATH = AGENT_CARD_PATH;
exports.AuthenticatedExtendedCardNotConfiguredError = AuthenticatedExtendedCardNotConfiguredError;
exports.ContentTypeNotSupportedError = ContentTypeNotSupportedError;
exports.HTTP_EXTENSION_HEADER = HTTP_EXTENSION_HEADER;
exports.InvalidAgentResponseError = InvalidAgentResponseError;
exports.PushNotificationNotSupportedError = PushNotificationNotSupportedError;
exports.SSE_HEADERS = SSE_HEADERS;
exports.TaskNotCancelableError = TaskNotCancelableError;
exports.TaskNotFoundError = TaskNotFoundError;
exports.UnsupportedOperationError = UnsupportedOperationError;
exports.formatSSEErrorEvent = formatSSEErrorEvent;
exports.formatSSEEvent = formatSSEEvent;
exports.parseSseStream = parseSseStream;
