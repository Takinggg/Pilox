import { supportsNoise } from './chunk-6CT5KQ5Q.js';
import { parseSseStream, TaskNotFoundError, TaskNotCancelableError, PushNotificationNotSupportedError, UnsupportedOperationError, ContentTypeNotSupportedError, InvalidAgentResponseError, AuthenticatedExtendedCardNotConfiguredError, AGENT_CARD_PATH } from './chunk-JKJJLJQL.js';

// src/core/client/transports/json_rpc_transport.ts
var JsonRpcTransport = class _JsonRpcTransport {
  customFetchImpl;
  endpoint;
  requestIdCounter = 1;
  constructor(options) {
    this.endpoint = options.endpoint;
    this.customFetchImpl = options.fetchImpl;
  }
  async getExtendedAgentCard(options, idOverride) {
    const rpcResponse = await this._sendRpcRequest("agent/getAuthenticatedExtendedCard", void 0, idOverride, options);
    return rpcResponse.result;
  }
  async sendMessage(params, options, idOverride) {
    const rpcResponse = await this._sendRpcRequest(
      "message/send",
      params,
      idOverride,
      options
    );
    return rpcResponse.result;
  }
  async *sendMessageStream(params, options) {
    yield* this._sendStreamingRequest("message/stream", params, options);
  }
  async setTaskPushNotificationConfig(params, options, idOverride) {
    const rpcResponse = await this._sendRpcRequest("tasks/pushNotificationConfig/set", params, idOverride, options);
    return rpcResponse.result;
  }
  async getTaskPushNotificationConfig(params, options, idOverride) {
    const rpcResponse = await this._sendRpcRequest("tasks/pushNotificationConfig/get", params, idOverride, options);
    return rpcResponse.result;
  }
  async listTaskPushNotificationConfig(params, options, idOverride) {
    const rpcResponse = await this._sendRpcRequest("tasks/pushNotificationConfig/list", params, idOverride, options);
    return rpcResponse.result;
  }
  async deleteTaskPushNotificationConfig(params, options, idOverride) {
    await this._sendRpcRequest("tasks/pushNotificationConfig/delete", params, idOverride, options);
  }
  async getTask(params, options, idOverride) {
    const rpcResponse = await this._sendRpcRequest(
      "tasks/get",
      params,
      idOverride,
      options
    );
    return rpcResponse.result;
  }
  async cancelTask(params, options, idOverride) {
    const rpcResponse = await this._sendRpcRequest(
      "tasks/cancel",
      params,
      idOverride,
      options
    );
    return rpcResponse.result;
  }
  async *resubscribeTask(params, options) {
    yield* this._sendStreamingRequest("tasks/resubscribe", params, options);
  }
  async callExtensionMethod(method, params, idOverride, options) {
    return await this._sendRpcRequest(
      method,
      params,
      idOverride,
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
      "A `fetch` implementation was not provided and is not available in the global scope. Please provide a `fetchImpl` in the A2ATransportOptions. "
    );
  }
  async _sendRpcRequest(method, params, idOverride, options) {
    const requestId = idOverride ?? this.requestIdCounter++;
    const rpcRequest = {
      jsonrpc: "2.0",
      method,
      params,
      id: requestId
    };
    const httpResponse = await this._fetchRpc(rpcRequest, "application/json", options);
    if (!httpResponse.ok) {
      let errorBodyText = "(empty or non-JSON response)";
      let errorJson;
      try {
        errorBodyText = await httpResponse.text();
        errorJson = JSON.parse(errorBodyText);
      } catch (e) {
        throw new Error(
          `HTTP error for ${method}! Status: ${httpResponse.status} ${httpResponse.statusText}. Response: ${errorBodyText}`,
          { cause: e }
        );
      }
      if (errorJson.jsonrpc && errorJson.error) {
        throw _JsonRpcTransport.mapToError(errorJson);
      } else {
        throw new Error(
          `HTTP error for ${method}! Status: ${httpResponse.status} ${httpResponse.statusText}. Response: ${errorBodyText}`
        );
      }
    }
    const rpcResponse = await httpResponse.json();
    if (rpcResponse.id !== requestId) {
      throw new Error(
        `JSON-RPC response ID mismatch for method ${method}. Expected ${requestId}, got ${rpcResponse.id}.`
      );
    }
    if ("error" in rpcResponse) {
      throw _JsonRpcTransport.mapToError(rpcResponse);
    }
    return rpcResponse;
  }
  async _fetchRpc(rpcRequest, acceptHeader = "application/json", options) {
    const requestInit = {
      method: "POST",
      headers: {
        ...options?.serviceParameters,
        "Content-Type": "application/json",
        Accept: acceptHeader
      },
      body: JSON.stringify(rpcRequest),
      signal: options?.signal
    };
    return this._fetch(this.endpoint, requestInit);
  }
  async *_sendStreamingRequest(method, params, options) {
    const clientRequestId = this.requestIdCounter++;
    const rpcRequest = {
      jsonrpc: "2.0",
      method,
      params,
      id: clientRequestId
    };
    const response = await this._fetchRpc(rpcRequest, "text/event-stream", options);
    if (!response.ok) {
      let errorBody = "";
      let errorJson;
      try {
        errorBody = await response.text();
        errorJson = JSON.parse(errorBody);
      } catch (e) {
        throw new Error(
          `HTTP error establishing stream for ${method}: ${response.status} ${response.statusText}. Response: ${errorBody || "(empty)"}`,
          { cause: e }
        );
      }
      if (errorJson.error) {
        throw new Error(
          `HTTP error establishing stream for ${method}: ${response.status} ${response.statusText}. RPC Error: ${errorJson.error.message} (Code: ${errorJson.error.code})`
        );
      }
      throw new Error(
        `HTTP error establishing stream for ${method}: ${response.status} ${response.statusText}`
      );
    }
    if (!response.headers.get("Content-Type")?.startsWith("text/event-stream")) {
      throw new Error(
        `Invalid response Content-Type for SSE stream for ${method}. Expected 'text/event-stream'.`
      );
    }
    for await (const event of parseSseStream(response)) {
      yield this._processSseEventData(event.data, clientRequestId);
    }
  }
  _processSseEventData(jsonData, originalRequestId) {
    if (!jsonData.trim()) {
      throw new Error("Attempted to process empty SSE event data.");
    }
    let a2aStreamResponse;
    try {
      a2aStreamResponse = JSON.parse(jsonData);
    } catch (e) {
      throw new Error(
        `Failed to parse SSE event data: "${jsonData.substring(0, 100)}...". Original error: ${e instanceof Error && e.message || "Unknown error"}`,
        { cause: e }
      );
    }
    if (a2aStreamResponse.id !== originalRequestId) {
      throw new Error(
        `JSON-RPC response ID mismatch in SSE event. Expected ${originalRequestId}, got ${a2aStreamResponse.id}.`
      );
    }
    if ("error" in a2aStreamResponse) {
      const err = a2aStreamResponse.error;
      throw new Error(
        `SSE event contained an error: ${err.message} (Code: ${err.code}) Data: ${JSON.stringify(err.data || {})}`,
        { cause: _JsonRpcTransport.mapToError(a2aStreamResponse) }
      );
    }
    if (!("result" in a2aStreamResponse) || typeof a2aStreamResponse.result === "undefined") {
      throw new Error(`SSE event JSON-RPC response is missing 'result' field. Data: ${jsonData}`);
    }
    return a2aStreamResponse.result;
  }
  static mapToError(response) {
    switch (response.error.code) {
      case -32001:
        return new TaskNotFoundJSONRPCError(response);
      case -32002:
        return new TaskNotCancelableJSONRPCError(response);
      case -32003:
        return new PushNotificationNotSupportedJSONRPCError(response);
      case -32004:
        return new UnsupportedOperationJSONRPCError(response);
      case -32005:
        return new ContentTypeNotSupportedJSONRPCError(response);
      case -32006:
        return new InvalidAgentResponseJSONRPCError(response);
      case -32007:
        return new AuthenticatedExtendedCardNotConfiguredJSONRPCError(response);
      default:
        return new JSONRPCTransportError(response);
    }
  }
};
var JsonRpcTransportFactory = class _JsonRpcTransportFactory {
  constructor(options) {
    this.options = options;
  }
  /** Not named `name` — bundlers assign class names to read-only `Function#name`. */
  static protocolKey = "JSONRPC";
  get protocolName() {
    return _JsonRpcTransportFactory.protocolKey;
  }
  async create(url, _agentCard) {
    return new JsonRpcTransport({
      endpoint: url,
      fetchImpl: this.options?.fetchImpl
    });
  }
};
var JSONRPCTransportError = class extends Error {
  constructor(errorResponse) {
    super(
      `JSON-RPC error: ${errorResponse.error.message} (Code: ${errorResponse.error.code}) Data: ${JSON.stringify(errorResponse.error.data || {})}`
    );
    this.errorResponse = errorResponse;
  }
};
var TaskNotFoundJSONRPCError = class extends TaskNotFoundError {
  constructor(errorResponse) {
    super();
    this.errorResponse = errorResponse;
  }
};
var TaskNotCancelableJSONRPCError = class extends TaskNotCancelableError {
  constructor(errorResponse) {
    super();
    this.errorResponse = errorResponse;
  }
};
var PushNotificationNotSupportedJSONRPCError = class extends PushNotificationNotSupportedError {
  constructor(errorResponse) {
    super();
    this.errorResponse = errorResponse;
  }
};
var UnsupportedOperationJSONRPCError = class extends UnsupportedOperationError {
  constructor(errorResponse) {
    super();
    this.errorResponse = errorResponse;
  }
};
var ContentTypeNotSupportedJSONRPCError = class extends ContentTypeNotSupportedError {
  constructor(errorResponse) {
    super();
    this.errorResponse = errorResponse;
  }
};
var InvalidAgentResponseJSONRPCError = class extends InvalidAgentResponseError {
  constructor(errorResponse) {
    super();
    this.errorResponse = errorResponse;
  }
};
var AuthenticatedExtendedCardNotConfiguredJSONRPCError = class extends AuthenticatedExtendedCardNotConfiguredError {
  constructor(errorResponse) {
    super();
    this.errorResponse = errorResponse;
  }
};

// src/core/client/client.ts
var A2AClient = class _A2AClient {
  static emptyOptions = void 0;
  agentCardPromise;
  customFetchImpl;
  serviceEndpointUrl;
  // To be populated from AgentCard after fetchin
  // A2AClient is built around JSON-RPC types, so it will only support JSON-RPC transport, new client with transport agnostic interface is going to be created for multi-transport.
  // New transport abstraction isn't going to expose individual transport specific fields, so to keep returning JSON-RPC IDs here for compatibility,
  // keep counter here and pass it to JsonRpcTransport via an optional idOverride parameter (which is not visible via transport-agnostic A2ATransport interface).
  transport;
  requestIdCounter = 1;
  /**
   * Constructs an A2AClient instance from an AgentCard.
   * @param agentCard The AgentCard object.
   * @param options Optional. The options for the A2AClient including the fetch/auth implementation.
   */
  constructor(agentCard, options) {
    this.customFetchImpl = options?.fetchImpl;
    if (typeof agentCard === "string") {
      console.warn(
        "Warning: Constructing A2AClient with a URL is deprecated. Please use A2AClient.fromCardUrl() instead."
      );
      this.agentCardPromise = this._fetchAndCacheAgentCard(agentCard, options?.agentCardPath);
    } else {
      if (!agentCard.url) {
        throw new Error(
          "Provided Agent Card does not contain a valid 'url' for the service endpoint."
        );
      }
      this.serviceEndpointUrl = agentCard.url;
      this.agentCardPromise = Promise.resolve(agentCard);
    }
  }
  /**
   * Dynamically resolves the fetch implementation to use for requests.
   * Prefers a custom implementation if provided, otherwise falls back to the global fetch.
   * @returns The fetch implementation.
   * @param args Arguments to pass to the fetch implementation.
   * @throws If no fetch implementation is available.
   */
  _fetch(...args) {
    if (this.customFetchImpl) {
      return this.customFetchImpl(...args);
    }
    if (typeof fetch === "function") {
      return fetch(...args);
    }
    throw new Error(
      "A `fetch` implementation was not provided and is not available in the global scope. Please provide a `fetchImpl` in the A2AClientOptions. For earlier Node.js versions (pre-v18), you can use a library like `node-fetch`."
    );
  }
  /**
   * Creates an A2AClient instance by fetching the AgentCard from a URL then constructing the A2AClient.
   * @param agentCardUrl The URL of the agent card.
   * @param options Optional. The options for the A2AClient including the fetch/auth implementation.
   * @returns A Promise that resolves to a new A2AClient instance.
   */
  static async fromCardUrl(agentCardUrl, options) {
    const fetchImpl = options?.fetchImpl;
    const requestInit = {
      headers: { Accept: "application/json" }
    };
    let response;
    if (fetchImpl) {
      response = await fetchImpl(agentCardUrl, requestInit);
    } else if (typeof fetch === "function") {
      response = await fetch(agentCardUrl, requestInit);
    } else {
      throw new Error(
        "A `fetch` implementation was not provided and is not available in the global scope. Please provide a `fetchImpl` in the A2AClientOptions. For earlier Node.js versions (pre-v18), you can use a library like `node-fetch`."
      );
    }
    if (!response.ok) {
      throw new Error(
        `Failed to fetch Agent Card from ${agentCardUrl}: ${response.status} ${response.statusText}`
      );
    }
    let agentCard;
    try {
      agentCard = await response.json();
    } catch (error) {
      console.error("Failed to parse Agent Card JSON:", error);
      throw new Error(
        `Failed to parse Agent Card JSON from ${agentCardUrl}. Original error: ${error.message}`
      );
    }
    return new _A2AClient(agentCard, options);
  }
  /**
   * Sends a message to the agent.
   * The behavior (blocking/non-blocking) and push notification configuration
   * are specified within the `params.configuration` object.
   * Optionally, `params.message.contextId` or `params.message.taskId` can be provided.
   * @param params The parameters for sending the message, including the message content and configuration.
   * @returns A Promise resolving to SendMessageResponse, which can be a Message, Task, or an error.
   */
  async sendMessage(params) {
    return await this.invokeJsonRpc(
      (t, p, id) => t.sendMessage(p, _A2AClient.emptyOptions, id),
      params
    );
  }
  /**
   * Sends a message to the agent and streams back responses using Server-Sent Events (SSE).
   * Push notification configuration can be specified in `params.configuration`.
   * Optionally, `params.message.contextId` or `params.message.taskId` can be provided.
   * Requires the agent to support streaming (`capabilities.streaming: true` in AgentCard).
   * @param params The parameters for sending the message.
   * @returns An AsyncGenerator yielding A2AStreamEventData (Message, Task, TaskStatusUpdateEvent, or TaskArtifactUpdateEvent).
   * The generator throws an error if streaming is not supported or if an HTTP/SSE error occurs.
   */
  async *sendMessageStream(params) {
    const agentCard = await this.agentCardPromise;
    if (!agentCard.capabilities?.streaming) {
      throw new Error(
        "Agent does not support streaming (AgentCard.capabilities.streaming is not true)."
      );
    }
    const transport = await this._getOrCreateTransport();
    yield* transport.sendMessageStream(params);
  }
  /**
   * Sets or updates the push notification configuration for a given task.
   * Requires the agent to support push notifications (`capabilities.pushNotifications: true` in AgentCard).
   * @param params Parameters containing the taskId and the TaskPushNotificationConfig.
   * @returns A Promise resolving to SetTaskPushNotificationConfigResponse.
   */
  async setTaskPushNotificationConfig(params) {
    const agentCard = await this.agentCardPromise;
    if (!agentCard.capabilities?.pushNotifications) {
      throw new Error(
        "Agent does not support push notifications (AgentCard.capabilities.pushNotifications is not true)."
      );
    }
    return await this.invokeJsonRpc((t, p, id) => t.setTaskPushNotificationConfig(p, _A2AClient.emptyOptions, id), params);
  }
  /**
   * Gets the push notification configuration for a given task.
   * @param params Parameters containing the taskId.
   * @returns A Promise resolving to GetTaskPushNotificationConfigResponse.
   */
  async getTaskPushNotificationConfig(params) {
    return await this.invokeJsonRpc(
      (t, p, id) => t.getTaskPushNotificationConfig(p, _A2AClient.emptyOptions, id),
      params
    );
  }
  /**
   * Lists the push notification configurations for a given task.
   * @param params Parameters containing the taskId.
   * @returns A Promise resolving to ListTaskPushNotificationConfigResponse.
   */
  async listTaskPushNotificationConfig(params) {
    return await this.invokeJsonRpc((t, p, id) => t.listTaskPushNotificationConfig(p, _A2AClient.emptyOptions, id), params);
  }
  /**
   * Deletes the push notification configuration for a given task.
   * @param params Parameters containing the taskId and push notification configuration ID.
   * @returns A Promise resolving to DeleteTaskPushNotificationConfigResponse.
   */
  async deleteTaskPushNotificationConfig(params) {
    return await this.invokeJsonRpc((t, p, id) => t.deleteTaskPushNotificationConfig(p, _A2AClient.emptyOptions, id), params);
  }
  /**
   * Retrieves a task by its ID.
   * @param params Parameters containing the taskId and optional historyLength.
   * @returns A Promise resolving to GetTaskResponse, which contains the Task object or an error.
   */
  async getTask(params) {
    return await this.invokeJsonRpc(
      (t, p, id) => t.getTask(p, _A2AClient.emptyOptions, id),
      params
    );
  }
  /**
   * Cancels a task by its ID.
   * @param params Parameters containing the taskId.
   * @returns A Promise resolving to CancelTaskResponse, which contains the updated Task object or an error.
   */
  async cancelTask(params) {
    return await this.invokeJsonRpc(
      (t, p, id) => t.cancelTask(p, _A2AClient.emptyOptions, id),
      params
    );
  }
  /**
   * @template TExtensionParams The type of parameters for the custom extension method.
   * @template TExtensionResponse The type of response expected from the custom extension method.
   * This should extend JSONRPCResponse. This ensures the extension response is still a valid A2A response.
   * @param method Custom JSON-RPC method defined in the AgentCard's extensions.
   * @param params Extension paramters defined in the AgentCard's extensions.
   * @returns A Promise that resolves to the RPC response.
   */
  async callExtensionMethod(method, params) {
    const transport = await this._getOrCreateTransport();
    try {
      return await transport.callExtensionMethod(
        method,
        params,
        this.requestIdCounter++
      );
    } catch (e) {
      const errorResponse = extractJSONRPCError(e);
      if (errorResponse) {
        return errorResponse;
      }
      throw e;
    }
  }
  /**
   * Resubscribes to a task's event stream using Server-Sent Events (SSE).
   * This is used if a previous SSE connection for an active task was broken.
   * Requires the agent to support streaming (`capabilities.streaming: true` in AgentCard).
   * @param params Parameters containing the taskId.
   * @returns An AsyncGenerator yielding A2AStreamEventData (Message, Task, TaskStatusUpdateEvent, or TaskArtifactUpdateEvent).
   */
  async *resubscribeTask(params) {
    const agentCard = await this.agentCardPromise;
    if (!agentCard.capabilities?.streaming) {
      throw new Error("Agent does not support streaming (required for tasks/resubscribe).");
    }
    const transport = await this._getOrCreateTransport();
    yield* transport.resubscribeTask(params);
  }
  ////////////////////////////////////////////////////////////////////////////////
  // Functions used to support old A2AClient Constructor to be deprecated soon
  // TODOs:
  // * remove `agentCardPromise`, and just use agentCard initialized
  // * _getServiceEndpoint can be made synchronous or deleted and accessed via
  //   agentCard.url
  // * getAgentCard changed to this.agentCard
  // * delete resolveAgentCardUrl(), _fetchAndCacheAgentCard(),
  //   agentCardPath from A2AClientOptions
  // * delete _getOrCreateTransport
  ////////////////////////////////////////////////////////////////////////////////
  async _getOrCreateTransport() {
    if (this.transport) {
      return this.transport;
    }
    const endpoint = await this._getServiceEndpoint();
    this.transport = new JsonRpcTransport({ fetchImpl: this.customFetchImpl, endpoint });
    return this.transport;
  }
  /**
   * Fetches the Agent Card from the agent's well-known URI and caches its service endpoint URL.
   * This method is called by the constructor.
   * @param agentBaseUrl The base URL of the A2A agent (e.g., https://agent.example.com)
   * @param agentCardPath path to the agent card, defaults to .well-known/agent-card.json
   * @returns A Promise that resolves to the AgentCard.
   */
  async _fetchAndCacheAgentCard(agentBaseUrl, agentCardPath) {
    try {
      const agentCardUrl = this.resolveAgentCardUrl(agentBaseUrl, agentCardPath);
      const response = await this._fetch(agentCardUrl, {
        headers: { Accept: "application/json" }
      });
      if (!response.ok) {
        throw new Error(
          `Failed to fetch Agent Card from ${agentCardUrl}: ${response.status} ${response.statusText}`
        );
      }
      const agentCard = await response.json();
      if (!agentCard.url) {
        throw new Error(
          "Fetched Agent Card does not contain a valid 'url' for the service endpoint."
        );
      }
      this.serviceEndpointUrl = agentCard.url;
      return agentCard;
    } catch (error) {
      console.error("Error fetching or parsing Agent Card:", error);
      throw error;
    }
  }
  /**
   * Retrieves the Agent Card.
   * If an `agentBaseUrl` is provided, it fetches the card from that specific URL.
   * Otherwise, it returns the card fetched and cached during client construction.
   * @param agentBaseUrl Optional. The base URL of the agent to fetch the card from.
   * @param agentCardPath path to the agent card, defaults to .well-known/agent-card.json
   * If provided, this will fetch a new card, not use the cached one from the constructor's URL.
   * @returns A Promise that resolves to the AgentCard.
   */
  async getAgentCard(agentBaseUrl, agentCardPath) {
    if (agentBaseUrl) {
      const agentCardUrl = this.resolveAgentCardUrl(agentBaseUrl, agentCardPath);
      const response = await this._fetch(agentCardUrl, {
        headers: { Accept: "application/json" }
      });
      if (!response.ok) {
        throw new Error(
          `Failed to fetch Agent Card from ${agentCardUrl}: ${response.status} ${response.statusText}`
        );
      }
      return await response.json();
    }
    return this.agentCardPromise;
  }
  /**
   * Determines the agent card URL based on the agent URL.
   * @param agentBaseUrl The agent URL.
   * @param agentCardPath Optional relative path to the agent card, defaults to .well-known/agent-card.json
   */
  resolveAgentCardUrl(agentBaseUrl, agentCardPath = AGENT_CARD_PATH) {
    return `${agentBaseUrl.replace(/\/$/, "")}/${agentCardPath.replace(/^\//, "")}`;
  }
  /**
   * Gets the RPC service endpoint URL. Ensures the agent card has been fetched first.
   * @returns A Promise that resolves to the service endpoint URL string.
   */
  async _getServiceEndpoint() {
    if (this.serviceEndpointUrl) {
      return this.serviceEndpointUrl;
    }
    await this.agentCardPromise;
    if (!this.serviceEndpointUrl) {
      throw new Error(
        "Agent Card URL for RPC endpoint is not available. Fetching might have failed."
      );
    }
    return this.serviceEndpointUrl;
  }
  async invokeJsonRpc(caller, params) {
    const transport = await this._getOrCreateTransport();
    const requestId = this.requestIdCounter++;
    try {
      const result = await caller(transport, params, requestId);
      return {
        id: requestId,
        jsonrpc: "2.0",
        result: result ?? null
        // JSON-RPC requires result property on success, it will be null for "void" methods.
      };
    } catch (e) {
      const errorResponse = extractJSONRPCError(e);
      if (errorResponse) {
        return errorResponse;
      }
      throw e;
    }
  }
};
function extractJSONRPCError(error) {
  if (error instanceof Object && "errorResponse" in error && error.errorResponse instanceof Object && "jsonrpc" in error.errorResponse && error.errorResponse.jsonrpc === "2.0" && "error" in error.errorResponse && error.errorResponse.error !== null) {
    return error.errorResponse;
  } else {
    return void 0;
  }
}

// src/client/hive-client.ts
var HiveA2AClient = class _HiveA2AClient {
  client;
  config;
  peerIsHive = false;
  constructor(agentCardOrUrl, config = {}, options) {
    this.client = new A2AClient(agentCardOrUrl, options);
    this.config = config;
  }
  /** Create client from a remote Agent Card URL */
  static async fromUrl(url, config = {}, options) {
    return new _HiveA2AClient(url, config, options);
  }
  /** Get the remote agent's card */
  async getAgentCard() {
    const card = await this.client.getAgentCard();
    this.peerIsHive = supportsNoise(card);
    return card;
  }
  /** Check if the remote peer supports Hive extensions */
  isPeerHiveEnabled() {
    return this.peerIsHive;
  }
  /** Send a message to the remote agent */
  async sendMessage(params) {
    return this.client.sendMessage(params);
  }
  /** Stream messages from the remote agent */
  async *sendMessageStream(params) {
    yield* this.client.sendMessageStream(params);
  }
  /** Get a task by ID */
  async getTask(params) {
    return this.client.getTask(params);
  }
  /** Cancel a task */
  async cancelTask(params) {
    return this.client.cancelTask(params);
  }
};

export { A2AClient, HiveA2AClient, JsonRpcTransport, JsonRpcTransportFactory };
