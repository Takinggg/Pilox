import type { AgentCard, MessageSendParams, SendMessageResponse, TaskQueryParams, GetTaskResponse, TaskIdParams, CancelTaskResponse } from '../core/types.js';
import type { A2AClientOptions } from '../core/client/client.js';
import type { PiloxClientConfig } from '../config/types.js';
/**
 * PiloxA2AClient wraps the upstream A2AClient.
 * Adds Noise negotiation detection and Agent Card signature verification.
 */
export declare class PiloxA2AClient {
    private readonly client;
    private readonly config;
    private peerIsPilox;
    constructor(agentCardOrUrl: AgentCard | string, config?: PiloxClientConfig, options?: A2AClientOptions);
    /** Create client from a remote Agent Card URL */
    static fromUrl(url: string, config?: PiloxClientConfig, options?: A2AClientOptions): Promise<PiloxA2AClient>;
    /** Get the remote agent's card */
    getAgentCard(): Promise<AgentCard>;
    /** Check if the remote peer supports Pilox extensions */
    isPeerPiloxEnabled(): boolean;
    /** Send a message to the remote agent */
    sendMessage(params: MessageSendParams): Promise<SendMessageResponse>;
    /** Stream messages from the remote agent */
    sendMessageStream(params: MessageSendParams): AsyncGenerator<import("../core/client/client.js").A2AStreamEventData, void, undefined>;
    /** Get a task by ID */
    getTask(params: TaskQueryParams): Promise<GetTaskResponse>;
    /** Cancel a task */
    cancelTask(params: TaskIdParams): Promise<CancelTaskResponse>;
}
//# sourceMappingURL=pilox-client.d.ts.map