'use strict';

var chunk43X6IJYO_cjs = require('../../chunk-43X6IJYO.cjs');
var chunk22BKFC5W_cjs = require('../../chunk-22BKFC5W.cjs');
var chunkD6V5WZMX_cjs = require('../../chunk-D6V5WZMX.cjs');
var chunkUCDQAHV2_cjs = require('../../chunk-UCDQAHV2.cjs');
var chunk6NYM5ZKZ_cjs = require('../../chunk-6NYM5ZKZ.cjs');
var express = require('express');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

var express__default = /*#__PURE__*/_interopDefault(express);

function jsonRpcHandler(options) {
  const jsonRpcTransportHandler = new chunkD6V5WZMX_cjs.JsonRpcTransportHandler(options.requestHandler);
  const router = express__default.default.Router();
  router.use(express__default.default.json(), jsonErrorHandler);
  router.post("/", async (req, res) => {
    try {
      const user = await options.userBuilder(req);
      const context = new chunkUCDQAHV2_cjs.ServerCallContext(
        chunk6NYM5ZKZ_cjs.Extensions.parseServiceParameter(req.header(chunk22BKFC5W_cjs.HTTP_EXTENSION_HEADER)),
        user
      );
      const rpcResponseOrStream = await jsonRpcTransportHandler.handle(req.body, context);
      if (context.activatedExtensions) {
        res.setHeader(chunk22BKFC5W_cjs.HTTP_EXTENSION_HEADER, Array.from(context.activatedExtensions));
      }
      if (typeof rpcResponseOrStream?.[Symbol.asyncIterator] === "function") {
        const stream = rpcResponseOrStream;
        Object.entries(chunk22BKFC5W_cjs.SSE_HEADERS).forEach(([key, value]) => {
          res.setHeader(key, value);
        });
        res.flushHeaders();
        try {
          for await (const event of stream) {
            res.write(chunk22BKFC5W_cjs.formatSSEEvent(event));
          }
        } catch (streamError) {
          console.error(`Error during SSE streaming (request ${req.body?.id}):`, streamError);
          let a2aError;
          if (streamError instanceof chunk6NYM5ZKZ_cjs.A2AError) {
            a2aError = streamError;
          } else {
            a2aError = chunk6NYM5ZKZ_cjs.A2AError.internalError(
              streamError instanceof Error && streamError.message || "Streaming error."
            );
          }
          const errorResponse = {
            jsonrpc: "2.0",
            id: req.body?.id || null,
            // Use original request ID if available
            error: a2aError.toJSONRPCError()
          };
          if (!res.headersSent) {
            res.status(500).json(errorResponse);
          } else {
            res.write(chunk22BKFC5W_cjs.formatSSEErrorEvent(errorResponse));
          }
        } finally {
          if (!res.writableEnded) {
            res.end();
          }
        }
      } else {
        const rpcResponse = rpcResponseOrStream;
        res.status(200).json(rpcResponse);
      }
    } catch (error) {
      console.error("Unhandled error in JSON-RPC POST handler:", error);
      const a2aError = error instanceof chunk6NYM5ZKZ_cjs.A2AError ? error : chunk6NYM5ZKZ_cjs.A2AError.internalError("General processing error.");
      const errorResponse = {
        jsonrpc: "2.0",
        id: req.body?.id || null,
        error: a2aError.toJSONRPCError()
      };
      if (!res.headersSent) {
        res.status(500).json(errorResponse);
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  });
  return router;
}
var jsonErrorHandler = (err, _req, res, next) => {
  if (err instanceof SyntaxError && "body" in err) {
    const a2aError = chunk6NYM5ZKZ_cjs.A2AError.parseError("Invalid JSON payload.");
    const errorResponse = {
      jsonrpc: "2.0",
      id: null,
      error: a2aError.toJSONRPCError()
    };
    return res.status(400).json(errorResponse);
  }
  next(err);
};
function agentCardHandler(options) {
  const router = express__default.default.Router();
  const provider = typeof options.agentCardProvider === "function" ? options.agentCardProvider : options.agentCardProvider.getAgentCard.bind(options.agentCardProvider);
  router.get("/", async (_req, res) => {
    try {
      const agentCard = await provider();
      res.json(agentCard);
    } catch (error) {
      console.error("Error fetching agent card:", error);
      res.status(500).json({ error: "Failed to retrieve agent card" });
    }
  });
  return router;
}

// src/core/server/express/common.ts
var UserBuilder = {
  noAuthentication: () => Promise.resolve(new chunkD6V5WZMX_cjs.UnauthenticatedUser())
};

// src/core/server/express/a2a_express_app.ts
var A2AExpressApp = class {
  requestHandler;
  userBuilder;
  constructor(requestHandler, userBuilder = UserBuilder.noAuthentication) {
    this.requestHandler = requestHandler;
    this.userBuilder = userBuilder;
  }
  /**
   * Adds A2A routes to an existing Express app.
   * @param app Optional existing Express app.
   * @param baseUrl The base URL for A2A endpoints (e.g., "/a2a/api").
   * @param middlewares Optional array of Express middlewares to apply to the A2A routes.
   * @param agentCardPath Optional custom path for the agent card endpoint (defaults to .well-known/agent-card.json).
   * @returns The Express app with A2A routes.
   */
  setupRoutes(app, baseUrl = "", middlewares, agentCardPath = chunk22BKFC5W_cjs.AGENT_CARD_PATH) {
    const router = express__default.default.Router();
    router.use(express__default.default.json(), jsonErrorHandler);
    if (middlewares && middlewares.length > 0) {
      router.use(middlewares);
    }
    router.use(
      jsonRpcHandler({
        requestHandler: this.requestHandler,
        userBuilder: this.userBuilder
      })
    );
    router.use(`/${agentCardPath}`, agentCardHandler({ agentCardProvider: this.requestHandler }));
    app.use(baseUrl, router);
    return app;
  }
};

// src/core/server/transports/rest/rest_transport_handler.ts
var HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501
};
function mapErrorToStatus(errorCode) {
  switch (errorCode) {
    case chunk22BKFC5W_cjs.A2A_ERROR_CODE.PARSE_ERROR:
    case chunk22BKFC5W_cjs.A2A_ERROR_CODE.INVALID_REQUEST:
    case chunk22BKFC5W_cjs.A2A_ERROR_CODE.INVALID_PARAMS:
      return HTTP_STATUS.BAD_REQUEST;
    case chunk22BKFC5W_cjs.A2A_ERROR_CODE.METHOD_NOT_FOUND:
    case chunk22BKFC5W_cjs.A2A_ERROR_CODE.TASK_NOT_FOUND:
      return HTTP_STATUS.NOT_FOUND;
    case chunk22BKFC5W_cjs.A2A_ERROR_CODE.TASK_NOT_CANCELABLE:
      return HTTP_STATUS.CONFLICT;
    case chunk22BKFC5W_cjs.A2A_ERROR_CODE.PUSH_NOTIFICATION_NOT_SUPPORTED:
    case chunk22BKFC5W_cjs.A2A_ERROR_CODE.UNSUPPORTED_OPERATION:
      return HTTP_STATUS.BAD_REQUEST;
    default:
      return HTTP_STATUS.INTERNAL_SERVER_ERROR;
  }
}
function toHTTPError(error) {
  const errorObject = {
    code: error.code,
    message: error.message
  };
  if (error.data !== void 0) {
    errorObject.data = error.data;
  }
  return errorObject;
}
var RestTransportHandler = class _RestTransportHandler {
  requestHandler;
  constructor(requestHandler) {
    this.requestHandler = requestHandler;
  }
  // ==========================================================================
  // Public API Methods
  // ==========================================================================
  /**
   * Gets the agent card (for capability checks).
   */
  async getAgentCard() {
    return this.requestHandler.getAgentCard();
  }
  /**
   * Gets the authenticated extended agent card.
   */
  async getAuthenticatedExtendedAgentCard(context) {
    return this.requestHandler.getAuthenticatedExtendedAgentCard(context);
  }
  /**
   * Validate MessageSendParams.
   */
  validateMessageSendParams(params) {
    if (!params.message) {
      throw chunk6NYM5ZKZ_cjs.A2AError.invalidParams("message is required");
    }
    if (!params.message.messageId) {
      throw chunk6NYM5ZKZ_cjs.A2AError.invalidParams("message.messageId is required");
    }
  }
  /**
   * Sends a message to the agent.
   */
  async sendMessage(params, context) {
    this.validateMessageSendParams(params);
    return this.requestHandler.sendMessage(params, context);
  }
  /**
   * Sends a message with streaming response.
   * @throws {A2AError} UnsupportedOperation if streaming not supported
   */
  async sendMessageStream(params, context) {
    await this.requireCapability("streaming");
    this.validateMessageSendParams(params);
    return this.requestHandler.sendMessageStream(params, context);
  }
  /**
   * Gets a task by ID.
   * Validates historyLength parameter if provided.
   */
  async getTask(taskId, context, historyLength) {
    const params = { id: taskId };
    if (historyLength !== void 0) {
      params.historyLength = this.parseHistoryLength(historyLength);
    }
    return this.requestHandler.getTask(params, context);
  }
  /**
   * Cancels a task.
   */
  async cancelTask(taskId, context) {
    const params = { id: taskId };
    return this.requestHandler.cancelTask(params, context);
  }
  /**
   * Resubscribes to task updates.
   * Returns camelCase stream of task updates.
   * @throws {A2AError} UnsupportedOperation if streaming not supported
   */
  async resubscribe(taskId, context) {
    await this.requireCapability("streaming");
    const params = { id: taskId };
    return this.requestHandler.resubscribe(params, context);
  }
  /**
   * Sets a push notification configuration.
   * @throws {A2AError} PushNotificationNotSupported if push notifications not supported
   */
  async setTaskPushNotificationConfig(config, context) {
    await this.requireCapability("pushNotifications");
    if (!config.taskId) {
      throw chunk6NYM5ZKZ_cjs.A2AError.invalidParams("taskId is required");
    }
    if (!config.pushNotificationConfig) {
      throw chunk6NYM5ZKZ_cjs.A2AError.invalidParams("pushNotificationConfig is required");
    }
    return this.requestHandler.setTaskPushNotificationConfig(config, context);
  }
  /**
   * Lists all push notification configurations for a task.
   */
  async listTaskPushNotificationConfigs(taskId, context) {
    return this.requestHandler.listTaskPushNotificationConfigs({ id: taskId }, context);
  }
  /**
   * Gets a specific push notification configuration.
   */
  async getTaskPushNotificationConfig(taskId, configId, context) {
    return this.requestHandler.getTaskPushNotificationConfig(
      { id: taskId, pushNotificationConfigId: configId },
      context
    );
  }
  /**
   * Deletes a push notification configuration.
   */
  async deleteTaskPushNotificationConfig(taskId, configId, context) {
    await this.requestHandler.deleteTaskPushNotificationConfig(
      { id: taskId, pushNotificationConfigId: configId },
      context
    );
  }
  /**
   * Static map of capability to error for missing capabilities.
   */
  static CAPABILITY_ERRORS = {
    streaming: () => chunk6NYM5ZKZ_cjs.A2AError.unsupportedOperation("Agent does not support streaming"),
    pushNotifications: () => chunk6NYM5ZKZ_cjs.A2AError.pushNotificationNotSupported()
  };
  /**
   * Validates that the agent supports a required capability.
   * @throws {A2AError} UnsupportedOperation for streaming, PushNotificationNotSupported for push notifications
   */
  async requireCapability(capability) {
    const agentCard = await this.getAgentCard();
    if (!agentCard.capabilities?.[capability]) {
      throw _RestTransportHandler.CAPABILITY_ERRORS[capability]();
    }
  }
  /**
   * Parses and validates historyLength query parameter.
   */
  parseHistoryLength(value) {
    if (value === void 0 || value === null) {
      throw chunk6NYM5ZKZ_cjs.A2AError.invalidParams("historyLength is required");
    }
    const parsed = parseInt(String(value), 10);
    if (isNaN(parsed)) {
      throw chunk6NYM5ZKZ_cjs.A2AError.invalidParams("historyLength must be a valid integer");
    }
    if (parsed < 0) {
      throw chunk6NYM5ZKZ_cjs.A2AError.invalidParams("historyLength must be non-negative");
    }
    return parsed;
  }
};

// src/core/server/express/rest_handler.ts
function routeParam(v) {
  if (v == null) return "";
  return Array.isArray(v) ? v[0] ?? "" : v;
}
var restErrorHandler = (err, _req, res, next) => {
  if (err instanceof SyntaxError && "body" in err) {
    const a2aError = chunk6NYM5ZKZ_cjs.A2AError.parseError("Invalid JSON payload.");
    return res.status(400).json(toHTTPError(a2aError));
  }
  next(err);
};
function restHandler(options) {
  const router = express__default.default.Router();
  const restTransportHandler = new RestTransportHandler(options.requestHandler);
  router.use(express__default.default.json(), restErrorHandler);
  const buildContext = async (req) => {
    const user = await options.userBuilder(req);
    return new chunkUCDQAHV2_cjs.ServerCallContext(
      chunk6NYM5ZKZ_cjs.Extensions.parseServiceParameter(req.header(chunk22BKFC5W_cjs.HTTP_EXTENSION_HEADER)),
      user
    );
  };
  const setExtensionsHeader = (res, context) => {
    if (context.activatedExtensions) {
      res.setHeader(chunk22BKFC5W_cjs.HTTP_EXTENSION_HEADER, Array.from(context.activatedExtensions));
    }
  };
  const sendResponse = (res, statusCode, context, body, responseType) => {
    setExtensionsHeader(res, context);
    res.status(statusCode);
    if (statusCode === HTTP_STATUS.NO_CONTENT) {
      res.end();
    } else {
      if (!responseType || body === void 0) {
        throw new Error("Bug: toJson serializer and body must be provided for non-204 responses.");
      }
      res.json(responseType.toJSON(body));
    }
  };
  const sendStreamResponse = async (res, stream, context) => {
    const iterator = stream[Symbol.asyncIterator]();
    let firstResult;
    try {
      firstResult = await iterator.next();
    } catch (error) {
      const a2aError = error instanceof chunk6NYM5ZKZ_cjs.A2AError ? error : chunk6NYM5ZKZ_cjs.A2AError.internalError(error instanceof Error ? error.message : "Streaming error");
      const statusCode = mapErrorToStatus(a2aError.code);
      sendResponse(res, statusCode, context, toHTTPError(a2aError));
      return;
    }
    Object.entries(chunk22BKFC5W_cjs.SSE_HEADERS).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    setExtensionsHeader(res, context);
    res.flushHeaders();
    try {
      if (!firstResult.done) {
        const proto = chunk43X6IJYO_cjs.ToProto.messageStreamResult(firstResult.value);
        const result = chunk43X6IJYO_cjs.StreamResponse.toJSON(proto);
        res.write(chunk22BKFC5W_cjs.formatSSEEvent(result));
      }
      for await (const event of { [Symbol.asyncIterator]: () => iterator }) {
        const proto = chunk43X6IJYO_cjs.ToProto.messageStreamResult(event);
        const result = chunk43X6IJYO_cjs.StreamResponse.toJSON(proto);
        res.write(chunk22BKFC5W_cjs.formatSSEEvent(result));
      }
    } catch (streamError) {
      console.error("SSE streaming error:", streamError);
      const a2aError = streamError instanceof chunk6NYM5ZKZ_cjs.A2AError ? streamError : chunk6NYM5ZKZ_cjs.A2AError.internalError(
        streamError instanceof Error ? streamError.message : "Streaming error"
      );
      if (!res.writableEnded) {
        res.write(chunk22BKFC5W_cjs.formatSSEErrorEvent(toHTTPError(a2aError)));
      }
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  };
  const handleError = (res, error) => {
    if (res.headersSent) {
      if (!res.writableEnded) {
        res.end();
      }
      return;
    }
    const a2aError = error instanceof chunk6NYM5ZKZ_cjs.A2AError ? error : chunk6NYM5ZKZ_cjs.A2AError.internalError(error instanceof Error ? error.message : "Internal server error");
    const statusCode = mapErrorToStatus(a2aError.code);
    res.status(statusCode).json(toHTTPError(a2aError));
  };
  const asyncHandler = (handler) => {
    return async (req, res) => {
      try {
        await handler(req, res);
      } catch (error) {
        handleError(res, error);
      }
    };
  };
  router.get(
    "/v1/card",
    asyncHandler(async (req, res) => {
      const context = await buildContext(req);
      const result = await restTransportHandler.getAuthenticatedExtendedAgentCard(context);
      const protoResult = chunk43X6IJYO_cjs.ToProto.agentCard(result);
      sendResponse(res, HTTP_STATUS.OK, context, protoResult, chunk43X6IJYO_cjs.AgentCard);
    })
  );
  router.post(
    "/v1/message\\:send",
    asyncHandler(async (req, res) => {
      const context = await buildContext(req);
      const protoReq = chunk43X6IJYO_cjs.SendMessageRequest.fromJSON(req.body);
      const params = chunk43X6IJYO_cjs.FromProto.messageSendParams(protoReq);
      const result = await restTransportHandler.sendMessage(params, context);
      const protoResult = chunk43X6IJYO_cjs.ToProto.messageSendResult(result);
      sendResponse(
        res,
        HTTP_STATUS.CREATED,
        context,
        protoResult,
        chunk43X6IJYO_cjs.SendMessageResponse
      );
    })
  );
  router.post(
    "/v1/message\\:stream",
    asyncHandler(async (req, res) => {
      const context = await buildContext(req);
      const protoReq = chunk43X6IJYO_cjs.SendMessageRequest.fromJSON(req.body);
      const params = chunk43X6IJYO_cjs.FromProto.messageSendParams(protoReq);
      const stream = await restTransportHandler.sendMessageStream(params, context);
      await sendStreamResponse(res, stream, context);
    })
  );
  router.get(
    "/v1/tasks/:taskId",
    asyncHandler(async (req, res) => {
      const context = await buildContext(req);
      const result = await restTransportHandler.getTask(
        routeParam(req.params.taskId),
        context,
        //TODO: clarify for version 1.0.0 the format of the historyLength query parameter, and if history should always be added to the returned object
        req.query.historyLength ?? req.query.history_length
      );
      const protoResult = chunk43X6IJYO_cjs.ToProto.task(result);
      sendResponse(res, HTTP_STATUS.OK, context, protoResult, chunk43X6IJYO_cjs.Task);
    })
  );
  router.post(
    "/v1/tasks/:taskId\\:cancel",
    asyncHandler(async (req, res) => {
      const context = await buildContext(req);
      const result = await restTransportHandler.cancelTask(
        routeParam(req.params.taskId),
        context
      );
      const protoResult = chunk43X6IJYO_cjs.ToProto.task(result);
      sendResponse(res, HTTP_STATUS.ACCEPTED, context, protoResult, chunk43X6IJYO_cjs.Task);
    })
  );
  router.post(
    "/v1/tasks/:taskId\\:subscribe",
    asyncHandler(async (req, res) => {
      const context = await buildContext(req);
      const stream = await restTransportHandler.resubscribe(
        routeParam(req.params.taskId),
        context
      );
      await sendStreamResponse(res, stream, context);
    })
  );
  router.post(
    "/v1/tasks/:taskId/pushNotificationConfigs",
    asyncHandler(async (req, res) => {
      const context = await buildContext(req);
      const protoReq = chunk43X6IJYO_cjs.CreateTaskPushNotificationConfigRequest.fromJSON(req.body);
      const params = chunk43X6IJYO_cjs.FromProto.createTaskPushNotificationConfig(protoReq);
      const result = await restTransportHandler.setTaskPushNotificationConfig(params, context);
      const protoResult = chunk43X6IJYO_cjs.ToProto.taskPushNotificationConfig(result);
      sendResponse(
        res,
        HTTP_STATUS.CREATED,
        context,
        protoResult,
        chunk43X6IJYO_cjs.TaskPushNotificationConfig
      );
    })
  );
  router.get(
    "/v1/tasks/:taskId/pushNotificationConfigs",
    asyncHandler(async (req, res) => {
      const context = await buildContext(req);
      const result = await restTransportHandler.listTaskPushNotificationConfigs(
        routeParam(req.params.taskId),
        context
      );
      const protoResult = chunk43X6IJYO_cjs.ToProto.listTaskPushNotificationConfig(result);
      sendResponse(
        res,
        HTTP_STATUS.OK,
        context,
        protoResult,
        chunk43X6IJYO_cjs.ListTaskPushNotificationConfigResponse
      );
    })
  );
  router.get(
    "/v1/tasks/:taskId/pushNotificationConfigs/:configId",
    asyncHandler(async (req, res) => {
      const context = await buildContext(req);
      const result = await restTransportHandler.getTaskPushNotificationConfig(
        routeParam(req.params.taskId),
        routeParam(req.params.configId),
        context
      );
      const protoResult = chunk43X6IJYO_cjs.ToProto.taskPushNotificationConfig(result);
      sendResponse(
        res,
        HTTP_STATUS.OK,
        context,
        protoResult,
        chunk43X6IJYO_cjs.TaskPushNotificationConfig
      );
    })
  );
  router.delete(
    "/v1/tasks/:taskId/pushNotificationConfigs/:configId",
    asyncHandler(async (req, res) => {
      const context = await buildContext(req);
      await restTransportHandler.deleteTaskPushNotificationConfig(
        routeParam(req.params.taskId),
        routeParam(req.params.configId),
        context
      );
      sendResponse(res, HTTP_STATUS.NO_CONTENT, context);
    })
  );
  return router;
}

exports.A2AExpressApp = A2AExpressApp;
exports.UserBuilder = UserBuilder;
exports.agentCardHandler = agentCardHandler;
exports.jsonRpcHandler = jsonRpcHandler;
exports.restHandler = restHandler;
