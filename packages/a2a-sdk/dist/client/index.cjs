'use strict';

var chunkCH7UNMFN_cjs = require('../chunk-CH7UNMFN.cjs');
require('../chunk-FEJHDJOG.cjs');
var chunk43X6IJYO_cjs = require('../chunk-43X6IJYO.cjs');
var chunk22BKFC5W_cjs = require('../chunk-22BKFC5W.cjs');
var chunk6NYM5ZKZ_cjs = require('../chunk-6NYM5ZKZ.cjs');

// src/core/client/auth-handler.ts
function createAuthenticatingFetchWithRetry(fetchImpl, authHandler) {
  async function authFetch(url, init) {
    const authHeaders = await authHandler.headers() || {};
    const mergedInit = {
      ...init || {},
      headers: {
        ...authHeaders,
        ...init?.headers || {}
      }
    };
    let response = await fetchImpl(url, mergedInit);
    const updatedHeaders = await authHandler.shouldRetryWithHeaders(mergedInit, response);
    if (updatedHeaders) {
      const retryInit = {
        ...init || {},
        headers: {
          ...updatedHeaders,
          ...init?.headers || {}
        }
      };
      response = await fetchImpl(url, retryInit);
      if (response.ok && authHandler.onSuccessfulRetry) {
        await authHandler.onSuccessfulRetry(updatedHeaders);
      }
    }
    return response;
  }
  Object.setPrototypeOf(authFetch, Object.getPrototypeOf(fetchImpl));
  Object.defineProperties(authFetch, Object.getOwnPropertyDescriptors(fetchImpl));
  return authFetch;
}

// src/core/client/card-resolver.ts
var DefaultAgentCardResolver = class {
  constructor(options) {
    this.options = options;
  }
  /**
   * Fetches the agent card based on provided base URL and path.
   * Path is selected in the following order:
   * 1) path parameter
   * 2) path from options
   * 3) .well-known/agent-card.json
   */
  async resolve(baseUrl, path) {
    const agentCardUrl = new URL(path ?? this.options?.path ?? chunk22BKFC5W_cjs.AGENT_CARD_PATH, baseUrl);
    const response = await this.fetchImpl(agentCardUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch Agent Card from ${agentCardUrl}: ${response.status}`);
    }
    const rawCard = await response.json();
    return this.normalizeAgentCard(rawCard);
  }
  fetchImpl(...args) {
    if (this.options?.fetchImpl) {
      return this.options.fetchImpl(...args);
    }
    return fetch(...args);
  }
  /*
   * In the v0.3.0 specification, there was a structural drift between the JSON Schema data model
   * and the Protobuf-based data model for AgentCards.
   * The JSON Schema format uses a `"type"` discriminator (e.g., `{"type": "openIdConnect"}`),
   * while the Protobuf JSON representation uses the `oneof` field name as the discriminator
   * (e.g., `{"openIdConnectSecurityScheme": {...}}`).
   *
   * The A2A SDK internal logic expects the JSON Schema-based format. This fallback detection
   * allows us to parse cards served by endpoints returning the Protobuf JSON structure by
   * identifying the lack of the "type" field in security schemes or the presence of the
   * "schemes" wrapper in security entries, and normalizing it before use.
   */
  normalizeAgentCard(card) {
    if (this.isProtoAgentCard(card)) {
      const parsedProto = chunk43X6IJYO_cjs.AgentCard.fromJSON(card);
      return chunk43X6IJYO_cjs.FromProto.agentCard(parsedProto);
    }
    return card;
  }
  isProtoAgentCard(card) {
    if (!card || typeof card !== "object") return false;
    const c = card;
    if (this.hasProtoSecurity(c.security)) return true;
    if (this.hasProtoSecuritySchemes(c.securitySchemes)) return true;
    if (Array.isArray(c.skills)) {
      return c.skills.some(
        (skill) => skill && typeof skill === "object" && this.hasProtoSecurity(skill.security)
      );
    }
    return false;
  }
  hasProtoSecurity(securityArray) {
    if (Array.isArray(securityArray) && securityArray.length > 0) {
      const first = securityArray[0];
      return first && typeof first === "object" && "schemes" in first;
    }
    return false;
  }
  hasProtoSecuritySchemes(securitySchemes) {
    if (securitySchemes && typeof securitySchemes === "object") {
      const schemes = Object.values(securitySchemes);
      if (schemes.length > 0) {
        const first = schemes[0];
        return first && typeof first === "object" && !("type" in first);
      }
    }
    return false;
  }
};
var AgentCardResolver = {
  default: new DefaultAgentCardResolver()
};

// src/core/client/multitransport-client.ts
var Client = class {
  constructor(transport, agentCard, config) {
    this.transport = transport;
    this.agentCard = agentCard;
    this.config = config;
  }
  /**
   * If the current agent card supports the extended feature, it will try to fetch the extended agent card from the server,
   * Otherwise it will return the current agent card value.
   */
  async getAgentCard(options) {
    if (this.agentCard.supportsAuthenticatedExtendedCard) {
      this.agentCard = await this.executeWithInterceptors(
        { method: "getAgentCard" },
        options,
        (_, options2) => this.transport.getExtendedAgentCard(options2)
      );
    }
    return this.agentCard;
  }
  /**
   * Sends a message to an agent to initiate a new interaction or to continue an existing one.
   * Uses blocking mode by default.
   */
  sendMessage(params, options) {
    params = this.applyClientConfig({
      params,
      blocking: !(this.config?.polling ?? false)
    });
    return this.executeWithInterceptors(
      { method: "sendMessage", value: params },
      options,
      this.transport.sendMessage.bind(this.transport)
    );
  }
  /**
   * Sends a message to an agent to initiate/continue a task AND subscribes the client to real-time updates for that task.
   * Performs fallback to non-streaming if not supported by the agent.
   */
  async *sendMessageStream(params, options) {
    const method = "sendMessageStream";
    params = this.applyClientConfig({ params, blocking: true });
    const beforeArgs = {
      input: { method, value: params },
      agentCard: this.agentCard,
      options
    };
    const beforeResult = await this.interceptBefore(beforeArgs);
    if (beforeResult) {
      const earlyReturn = beforeResult.earlyReturn.value;
      const afterArgs = {
        result: { method, value: earlyReturn },
        agentCard: this.agentCard,
        options: beforeArgs.options
      };
      await this.interceptAfter(afterArgs, beforeResult.executed);
      yield afterArgs.result.value;
      return;
    }
    if (!this.agentCard.capabilities.streaming) {
      const result = await this.transport.sendMessage(beforeArgs.input.value, beforeArgs.options);
      const afterArgs = {
        result: { method, value: result },
        agentCard: this.agentCard,
        options: beforeArgs.options
      };
      await this.interceptAfter(afterArgs);
      yield afterArgs.result.value;
      return;
    }
    for await (const event of this.transport.sendMessageStream(
      beforeArgs.input.value,
      beforeArgs.options
    )) {
      const afterArgs = {
        result: { method, value: event },
        agentCard: this.agentCard,
        options: beforeArgs.options
      };
      await this.interceptAfter(afterArgs);
      yield afterArgs.result.value;
      if (afterArgs.earlyReturn) {
        return;
      }
    }
  }
  /**
   * Sets or updates the push notification configuration for a specified task.
   * Requires the server to have AgentCard.capabilities.pushNotifications: true.
   */
  setTaskPushNotificationConfig(params, options) {
    if (!this.agentCard.capabilities.pushNotifications) {
      throw new chunk22BKFC5W_cjs.PushNotificationNotSupportedError();
    }
    return this.executeWithInterceptors(
      { method: "setTaskPushNotificationConfig", value: params },
      options,
      this.transport.setTaskPushNotificationConfig.bind(this.transport)
    );
  }
  /**
   * Retrieves the current push notification configuration for a specified task.
   * Requires the server to have AgentCard.capabilities.pushNotifications: true.
   */
  getTaskPushNotificationConfig(params, options) {
    if (!this.agentCard.capabilities.pushNotifications) {
      throw new chunk22BKFC5W_cjs.PushNotificationNotSupportedError();
    }
    return this.executeWithInterceptors(
      { method: "getTaskPushNotificationConfig", value: params },
      options,
      this.transport.getTaskPushNotificationConfig.bind(this.transport)
    );
  }
  /**
   * Retrieves the associated push notification configurations for a specified task.
   * Requires the server to have AgentCard.capabilities.pushNotifications: true.
   */
  listTaskPushNotificationConfig(params, options) {
    if (!this.agentCard.capabilities.pushNotifications) {
      throw new chunk22BKFC5W_cjs.PushNotificationNotSupportedError();
    }
    return this.executeWithInterceptors(
      { method: "listTaskPushNotificationConfig", value: params },
      options,
      this.transport.listTaskPushNotificationConfig.bind(this.transport)
    );
  }
  /**
   * Deletes an associated push notification configuration for a task.
   */
  deleteTaskPushNotificationConfig(params, options) {
    return this.executeWithInterceptors(
      { method: "deleteTaskPushNotificationConfig", value: params },
      options,
      this.transport.deleteTaskPushNotificationConfig.bind(this.transport)
    );
  }
  /**
   * Retrieves the current state (including status, artifacts, and optionally history) of a previously initiated task.
   */
  getTask(params, options) {
    return this.executeWithInterceptors(
      { method: "getTask", value: params },
      options,
      this.transport.getTask.bind(this.transport)
    );
  }
  /**
   * Requests the cancellation of an ongoing task. The server will attempt to cancel the task,
   * but success is not guaranteed (e.g., the task might have already completed or failed, or cancellation might not be supported at its current stage).
   */
  cancelTask(params, options) {
    return this.executeWithInterceptors(
      { method: "cancelTask", value: params },
      options,
      this.transport.cancelTask.bind(this.transport)
    );
  }
  /**
   * Allows a client to reconnect to an updates stream for an ongoing task after a previous connection was interrupted.
   */
  async *resubscribeTask(params, options) {
    const method = "resubscribeTask";
    const beforeArgs = {
      input: { method, value: params },
      agentCard: this.agentCard,
      options
    };
    const beforeResult = await this.interceptBefore(beforeArgs);
    if (beforeResult) {
      const earlyReturn = beforeResult.earlyReturn.value;
      const afterArgs = {
        result: { method, value: earlyReturn },
        agentCard: this.agentCard,
        options: beforeArgs.options
      };
      await this.interceptAfter(afterArgs, beforeResult.executed);
      yield afterArgs.result.value;
      return;
    }
    for await (const event of this.transport.resubscribeTask(
      beforeArgs.input.value,
      beforeArgs.options
    )) {
      const afterArgs = {
        result: { method, value: event },
        agentCard: this.agentCard,
        options: beforeArgs.options
      };
      await this.interceptAfter(afterArgs);
      yield afterArgs.result.value;
      if (afterArgs.earlyReturn) {
        return;
      }
    }
  }
  applyClientConfig({
    params,
    blocking
  }) {
    const result = { ...params, configuration: params.configuration ?? {} };
    if (!result.configuration.acceptedOutputModes && this.config?.acceptedOutputModes) {
      result.configuration.acceptedOutputModes = this.config.acceptedOutputModes;
    }
    if (!result.configuration.pushNotificationConfig && this.config?.pushNotificationConfig) {
      result.configuration.pushNotificationConfig = this.config.pushNotificationConfig;
    }
    result.configuration.blocking ??= blocking;
    return result;
  }
  async executeWithInterceptors(input, options, transportCall) {
    const beforeArgs = {
      input,
      agentCard: this.agentCard,
      options
    };
    const beforeResult = await this.interceptBefore(beforeArgs);
    if (beforeResult) {
      const afterArgs2 = {
        result: {
          method: input.method,
          value: beforeResult.earlyReturn.value
        },
        agentCard: this.agentCard,
        options: beforeArgs.options
      };
      await this.interceptAfter(afterArgs2, beforeResult.executed);
      return afterArgs2.result.value;
    }
    const result = await transportCall(beforeArgs.input.value, beforeArgs.options);
    const afterArgs = {
      result: { method: input.method, value: result },
      agentCard: this.agentCard,
      options: beforeArgs.options
    };
    await this.interceptAfter(afterArgs);
    return afterArgs.result.value;
  }
  async interceptBefore(args) {
    if (!this.config?.interceptors || this.config.interceptors.length === 0) {
      return;
    }
    const executed = [];
    for (const interceptor of this.config.interceptors) {
      await interceptor.before(args);
      executed.push(interceptor);
      if (args.earlyReturn) {
        return {
          earlyReturn: args.earlyReturn,
          executed
        };
      }
    }
  }
  async interceptAfter(args, interceptors) {
    const reversedInterceptors = [...interceptors ?? this.config?.interceptors ?? []].reverse();
    for (const interceptor of reversedInterceptors) {
      await interceptor.after(args);
      if (args.earlyReturn) {
        return;
      }
    }
  }
};

// src/core/client/transports/rest_transport.ts
var RestTransport = class _RestTransport {
  customFetchImpl;
  endpoint;
  constructor(options) {
    this.endpoint = options.endpoint.replace(/\/+$/, "");
    this.customFetchImpl = options.fetchImpl;
  }
  async getExtendedAgentCard(options) {
    const response = await this._sendRequest(
      "GET",
      "/v1/card",
      void 0,
      options,
      void 0,
      chunk43X6IJYO_cjs.AgentCard
    );
    return chunk43X6IJYO_cjs.FromProto.agentCard(response);
  }
  async sendMessage(params, options) {
    const requestBody = chunk43X6IJYO_cjs.ToProto.messageSendParams(params);
    const response = await this._sendRequest(
      "POST",
      "/v1/message:send",
      requestBody,
      options,
      chunk43X6IJYO_cjs.SendMessageRequest,
      chunk43X6IJYO_cjs.SendMessageResponse
    );
    return chunk43X6IJYO_cjs.FromProto.sendMessageResult(response);
  }
  async *sendMessageStream(params, options) {
    const protoParams = chunk43X6IJYO_cjs.ToProto.messageSendParams(params);
    const requestBody = chunk43X6IJYO_cjs.SendMessageRequest.toJSON(protoParams);
    yield* this._sendStreamingRequest("/v1/message:stream", requestBody, options);
  }
  async setTaskPushNotificationConfig(params, options) {
    const requestBody = chunk43X6IJYO_cjs.ToProto.taskPushNotificationConfig(params);
    const response = await this._sendRequest(
      "POST",
      `/v1/tasks/${encodeURIComponent(params.taskId)}/pushNotificationConfigs`,
      requestBody,
      options,
      chunk43X6IJYO_cjs.TaskPushNotificationConfig,
      chunk43X6IJYO_cjs.TaskPushNotificationConfig
    );
    return chunk43X6IJYO_cjs.FromProto.taskPushNotificationConfig(response);
  }
  async getTaskPushNotificationConfig(params, options) {
    const { pushNotificationConfigId } = params;
    if (!pushNotificationConfigId) {
      throw new Error(
        "pushNotificationConfigId is required for getTaskPushNotificationConfig with REST transport."
      );
    }
    const response = await this._sendRequest(
      "GET",
      `/v1/tasks/${encodeURIComponent(params.id)}/pushNotificationConfigs/${encodeURIComponent(pushNotificationConfigId)}`,
      void 0,
      options,
      void 0,
      chunk43X6IJYO_cjs.TaskPushNotificationConfig
    );
    return chunk43X6IJYO_cjs.FromProto.taskPushNotificationConfig(response);
  }
  async listTaskPushNotificationConfig(params, options) {
    const response = await this._sendRequest(
      "GET",
      `/v1/tasks/${encodeURIComponent(params.id)}/pushNotificationConfigs`,
      void 0,
      options,
      void 0,
      chunk43X6IJYO_cjs.ListTaskPushNotificationConfigResponse
    );
    return chunk43X6IJYO_cjs.FromProto.listTaskPushNotificationConfig(response);
  }
  async deleteTaskPushNotificationConfig(params, options) {
    await this._sendRequest(
      "DELETE",
      `/v1/tasks/${encodeURIComponent(params.id)}/pushNotificationConfigs/${encodeURIComponent(params.pushNotificationConfigId)}`,
      void 0,
      options,
      void 0,
      void 0
    );
  }
  async getTask(params, options) {
    const queryParams = new URLSearchParams();
    if (params.historyLength !== void 0) {
      queryParams.set("historyLength", String(params.historyLength));
    }
    const queryString = queryParams.toString();
    const path = `/v1/tasks/${encodeURIComponent(params.id)}${queryString ? `?${queryString}` : ""}`;
    const response = await this._sendRequest(
      "GET",
      path,
      void 0,
      options,
      void 0,
      chunk43X6IJYO_cjs.Task
    );
    return chunk43X6IJYO_cjs.FromProto.task(response);
  }
  async cancelTask(params, options) {
    const response = await this._sendRequest(
      "POST",
      `/v1/tasks/${encodeURIComponent(params.id)}:cancel`,
      void 0,
      options,
      void 0,
      chunk43X6IJYO_cjs.Task
    );
    return chunk43X6IJYO_cjs.FromProto.task(response);
  }
  async *resubscribeTask(params, options) {
    yield* this._sendStreamingRequest(
      `/v1/tasks/${encodeURIComponent(params.id)}:subscribe`,
      void 0,
      options
    );
  }
  _fetch(...args) {
    if (this.customFetchImpl) {
      return this.customFetchImpl(...args);
    }
    if (typeof fetch === "function") {
      return fetch(...args);
    }
    throw new Error(
      "A `fetch` implementation was not provided and is not available in the global scope. Please provide a `fetchImpl` in the RestTransportOptions."
    );
  }
  _buildHeaders(options, acceptHeader = "application/json") {
    return {
      ...options?.serviceParameters,
      "Content-Type": "application/json",
      Accept: acceptHeader
    };
  }
  async _sendRequest(method, path, body, options, requestType, responseType) {
    const url = `${this.endpoint}${path}`;
    const requestInit = {
      method,
      headers: this._buildHeaders(options),
      signal: options?.signal
    };
    if (body !== void 0 && method !== "GET") {
      if (!requestType) {
        throw new Error(
          `Bug: Request body provided for ${method} ${path} but no toJson serializer provided.`
        );
      }
      requestInit.body = JSON.stringify(requestType.toJSON(body));
    }
    const response = await this._fetch(url, requestInit);
    if (!response.ok) {
      await this._handleErrorResponse(response, path);
    }
    if (response.status === 204 || !responseType) {
      return void 0;
    }
    const result = await response.json();
    return responseType.fromJSON(result);
  }
  async _handleErrorResponse(response, path) {
    let errorBodyText = "(empty or non-JSON response)";
    let errorBody;
    try {
      errorBodyText = await response.text();
      if (errorBodyText) {
        errorBody = JSON.parse(errorBodyText);
      }
    } catch (e) {
      throw new Error(
        `HTTP error for ${path}! Status: ${response.status} ${response.statusText}. Response: ${errorBodyText}`,
        { cause: e }
      );
    }
    if (errorBody && typeof errorBody.code === "number") {
      throw _RestTransport.mapToError(errorBody);
    }
    throw new Error(
      `HTTP error for ${path}! Status: ${response.status} ${response.statusText}. Response: ${errorBodyText}`
    );
  }
  async *_sendStreamingRequest(path, body, options) {
    const url = `${this.endpoint}${path}`;
    const requestInit = {
      method: "POST",
      headers: this._buildHeaders(options, "text/event-stream"),
      signal: options?.signal
    };
    if (body !== void 0) {
      requestInit.body = JSON.stringify(body);
    }
    const response = await this._fetch(url, requestInit);
    if (!response.ok) {
      await this._handleErrorResponse(response, path);
    }
    const contentType = response.headers.get("Content-Type");
    if (!contentType?.startsWith("text/event-stream")) {
      throw new Error(
        `Invalid response Content-Type for SSE stream. Expected 'text/event-stream', got '${contentType}'.`
      );
    }
    for await (const event of chunk22BKFC5W_cjs.parseSseStream(response)) {
      if (event.type === "error") {
        const errorData = JSON.parse(event.data);
        throw _RestTransport.mapToError(errorData);
      }
      yield this._processSseEventData(event.data);
    }
  }
  _processSseEventData(jsonData) {
    if (!jsonData.trim()) {
      throw new Error("Attempted to process empty SSE event data.");
    }
    try {
      const response = JSON.parse(jsonData);
      const protoResponse = chunk43X6IJYO_cjs.StreamResponse.fromJSON(response);
      return chunk43X6IJYO_cjs.FromProto.messageStreamResult(protoResponse);
    } catch (e) {
      console.error("Failed to parse SSE event data:", jsonData, e);
      throw new Error(
        `Failed to parse SSE event data: "${jsonData.substring(0, 100)}...". Original error: ${e instanceof Error && e.message || "Unknown error"}`
      );
    }
  }
  static mapToError(error) {
    switch (error.code) {
      case chunk22BKFC5W_cjs.A2A_ERROR_CODE.TASK_NOT_FOUND:
        return new chunk22BKFC5W_cjs.TaskNotFoundError(error.message);
      case chunk22BKFC5W_cjs.A2A_ERROR_CODE.TASK_NOT_CANCELABLE:
        return new chunk22BKFC5W_cjs.TaskNotCancelableError(error.message);
      case chunk22BKFC5W_cjs.A2A_ERROR_CODE.PUSH_NOTIFICATION_NOT_SUPPORTED:
        return new chunk22BKFC5W_cjs.PushNotificationNotSupportedError(error.message);
      case chunk22BKFC5W_cjs.A2A_ERROR_CODE.UNSUPPORTED_OPERATION:
        return new chunk22BKFC5W_cjs.UnsupportedOperationError(error.message);
      case chunk22BKFC5W_cjs.A2A_ERROR_CODE.CONTENT_TYPE_NOT_SUPPORTED:
        return new chunk22BKFC5W_cjs.ContentTypeNotSupportedError(error.message);
      case chunk22BKFC5W_cjs.A2A_ERROR_CODE.INVALID_AGENT_RESPONSE:
        return new chunk22BKFC5W_cjs.InvalidAgentResponseError(error.message);
      case chunk22BKFC5W_cjs.A2A_ERROR_CODE.AUTHENTICATED_EXTENDED_CARD_NOT_CONFIGURED:
        return new chunk22BKFC5W_cjs.AuthenticatedExtendedCardNotConfiguredError(error.message);
      default:
        return new Error(
          `REST error: ${error.message} (Code: ${error.code})${error.data ? ` Data: ${JSON.stringify(error.data)}` : ""}`
        );
    }
  }
};
var RestTransportFactory = class _RestTransportFactory {
  constructor(options) {
    this.options = options;
  }
  static protocolKey = "HTTP+JSON";
  get protocolName() {
    return _RestTransportFactory.protocolKey;
  }
  async create(url, _agentCard) {
    return new RestTransport({
      endpoint: url,
      fetchImpl: this.options?.fetchImpl
    });
  }
};

// src/core/client/factory.ts
var ClientFactoryOptions = {
  /**
   * SDK default options for {@link ClientFactory}.
   */
  default: {
    transports: [new chunkCH7UNMFN_cjs.JsonRpcTransportFactory(), new RestTransportFactory()]
  },
  /**
   * Creates new options by merging an original and an override object.
   * Transports are merged based on `TransportFactory.protocolName`,
   * interceptors are concatenated, other fields are overriden.
   *
   * @example
   * ```ts
   * const options = ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
   *  transports: [new MyCustomTransportFactory()], // adds a custom transport
   *  clientConfig: { interceptors: [new MyInterceptor()] }, // adds a custom interceptor
   * });
   * ```
   */
  createFrom(original, overrides) {
    return {
      ...original,
      ...overrides,
      transports: mergeTransports(original.transports, overrides.transports),
      clientConfig: {
        ...original.clientConfig ?? {},
        ...overrides.clientConfig ?? {},
        interceptors: mergeArrays(
          original.clientConfig?.interceptors,
          overrides.clientConfig?.interceptors
        ),
        acceptedOutputModes: overrides.clientConfig?.acceptedOutputModes ?? original.clientConfig?.acceptedOutputModes
      },
      preferredTransports: overrides.preferredTransports ?? original.preferredTransports
    };
  }
};
var ClientFactory = class {
  constructor(options = ClientFactoryOptions.default) {
    this.options = options;
    if (!options.transports || options.transports.length === 0) {
      throw new Error("No transports provided");
    }
    this.transportsByName = transportsByName(options.transports);
    for (const transport of options.preferredTransports ?? []) {
      if (!this.transportsByName.has(transport)) {
        throw new Error(
          `Unknown preferred transport: ${transport}, available transports: ${[...this.transportsByName.keys()].join()}`
        );
      }
    }
    this.agentCardResolver = options.cardResolver ?? AgentCardResolver.default;
  }
  transportsByName;
  agentCardResolver;
  /**
   * Creates a new client from the provided agent card.
   */
  async createFromAgentCard(agentCard) {
    const agentCardPreferred = agentCard.preferredTransport ?? chunkCH7UNMFN_cjs.JsonRpcTransportFactory.protocolKey;
    const additionalInterfaces = agentCard.additionalInterfaces ?? [];
    const urlsPerAgentTransports = new CaseInsensitiveMap([
      [agentCardPreferred, agentCard.url],
      ...additionalInterfaces.map((i) => [i.transport, i.url])
    ]);
    const transportsByPreference = [
      ...this.options.preferredTransports ?? [],
      agentCardPreferred,
      ...additionalInterfaces.map((i) => i.transport)
    ];
    for (const transport of transportsByPreference) {
      const url = urlsPerAgentTransports.get(transport);
      const factory = this.transportsByName.get(transport);
      if (factory && url) {
        return new Client(
          await factory.create(url, agentCard),
          agentCard,
          this.options.clientConfig
        );
      }
    }
    throw new Error(
      "No compatible transport found, available transports: " + [...this.transportsByName.keys()].join()
    );
  }
  /**
   * Downloads agent card using AgentCardResolver from options
   * and creates a new client from the downloaded card.
   *
   * @example
   * ```ts
   * const factory = new ClientFactory(); // use default options and default {@link AgentCardResolver}.
   * const client1 = await factory.createFromUrl('https://example.com'); // /.well-known/agent-card.json is used by default
   * const client2 = await factory.createFromUrl('https://example.com', '/my-agent-card.json'); // specify custom path
   * const client3 = await factory.createFromUrl('https://example.com/my-agent-card.json', ''); // specify full URL and set path to empty
   * ```
   */
  async createFromUrl(baseUrl, path) {
    const agentCard = await this.agentCardResolver.resolve(baseUrl, path);
    return this.createFromAgentCard(agentCard);
  }
};
function mergeTransports(original, overrides) {
  if (!overrides) {
    return original;
  }
  const result = transportsByName(original);
  const overridesByName = transportsByName(overrides);
  for (const [name, factory] of overridesByName) {
    result.set(name, factory);
  }
  return Array.from(result.values());
}
function transportsByName(transports) {
  const result = new CaseInsensitiveMap();
  if (!transports) {
    return result;
  }
  for (const t of transports) {
    if (result.has(t.protocolName)) {
      throw new Error(`Duplicate protocol name: ${t.protocolName}`);
    }
    result.set(t.protocolName, t);
  }
  return result;
}
function mergeArrays(a1, a2) {
  if (!a1 && !a2) {
    return void 0;
  }
  return [...a1 ?? [], ...a2 ?? []];
}
var CaseInsensitiveMap = class extends Map {
  normalizeKey(key) {
    return key.toUpperCase();
  }
  set(key, value) {
    return super.set(this.normalizeKey(key), value);
  }
  get(key) {
    return super.get(this.normalizeKey(key));
  }
  has(key) {
    return super.has(this.normalizeKey(key));
  }
  delete(key) {
    return super.delete(this.normalizeKey(key));
  }
};

// src/core/client/service-parameters.ts
var ServiceParameters = {
  create(...updates) {
    return ServiceParameters.createFrom(void 0, ...updates);
  },
  createFrom: (serviceParameters, ...updates) => {
    const result = serviceParameters ? { ...serviceParameters } : {};
    for (const update of updates) {
      update(result);
    }
    return result;
  }
};
function withA2AExtensions(...extensions) {
  return (parameters) => {
    parameters[chunk22BKFC5W_cjs.HTTP_EXTENSION_HEADER] = chunk6NYM5ZKZ_cjs.Extensions.toServiceParameter(extensions);
  };
}

// src/core/client/context.ts
var ClientCallContext = {
  /**
   * Create a new {@link ClientCallContext} with optional updates applied.
   */
  create: (...updates) => {
    return ClientCallContext.createFrom(void 0, ...updates);
  },
  /**
   * Create a new {@link ClientCallContext} based on an existing one with updates applied.
   */
  createFrom: (context, ...updates) => {
    const result = context ? { ...context } : {};
    for (const update of updates) {
      update(result);
    }
    return result;
  }
};
var ClientCallContextKey = class {
  symbol;
  constructor(description) {
    this.symbol = Symbol(description);
  }
  set(value) {
    return (context) => {
      context[this.symbol] = value;
    };
  }
  get(context) {
    return context[this.symbol];
  }
};

Object.defineProperty(exports, "A2AClient", {
  enumerable: true,
  get: function () { return chunkCH7UNMFN_cjs.A2AClient; }
});
Object.defineProperty(exports, "HiveA2AClient", {
  enumerable: true,
  get: function () { return chunkCH7UNMFN_cjs.HiveA2AClient; }
});
Object.defineProperty(exports, "JsonRpcTransport", {
  enumerable: true,
  get: function () { return chunkCH7UNMFN_cjs.JsonRpcTransport; }
});
Object.defineProperty(exports, "JsonRpcTransportFactory", {
  enumerable: true,
  get: function () { return chunkCH7UNMFN_cjs.JsonRpcTransportFactory; }
});
Object.defineProperty(exports, "AuthenticatedExtendedCardNotConfiguredError", {
  enumerable: true,
  get: function () { return chunk22BKFC5W_cjs.AuthenticatedExtendedCardNotConfiguredError; }
});
Object.defineProperty(exports, "ContentTypeNotSupportedError", {
  enumerable: true,
  get: function () { return chunk22BKFC5W_cjs.ContentTypeNotSupportedError; }
});
Object.defineProperty(exports, "InvalidAgentResponseError", {
  enumerable: true,
  get: function () { return chunk22BKFC5W_cjs.InvalidAgentResponseError; }
});
Object.defineProperty(exports, "PushNotificationNotSupportedError", {
  enumerable: true,
  get: function () { return chunk22BKFC5W_cjs.PushNotificationNotSupportedError; }
});
Object.defineProperty(exports, "TaskNotCancelableError", {
  enumerable: true,
  get: function () { return chunk22BKFC5W_cjs.TaskNotCancelableError; }
});
Object.defineProperty(exports, "TaskNotFoundError", {
  enumerable: true,
  get: function () { return chunk22BKFC5W_cjs.TaskNotFoundError; }
});
Object.defineProperty(exports, "UnsupportedOperationError", {
  enumerable: true,
  get: function () { return chunk22BKFC5W_cjs.UnsupportedOperationError; }
});
exports.AgentCardResolver = AgentCardResolver;
exports.Client = Client;
exports.ClientCallContext = ClientCallContext;
exports.ClientCallContextKey = ClientCallContextKey;
exports.ClientFactory = ClientFactory;
exports.ClientFactoryOptions = ClientFactoryOptions;
exports.DefaultAgentCardResolver = DefaultAgentCardResolver;
exports.RestTransport = RestTransport;
exports.RestTransportFactory = RestTransportFactory;
exports.ServiceParameters = ServiceParameters;
exports.createAuthenticatingFetchWithRetry = createAuthenticatingFetchWithRetry;
exports.withA2AExtensions = withA2AExtensions;
