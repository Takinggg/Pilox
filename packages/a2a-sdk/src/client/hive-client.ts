import type {
  AgentCard,
  MessageSendParams,
  SendMessageResponse,
  TaskQueryParams,
  GetTaskResponse,
  TaskIdParams,
  CancelTaskResponse,
} from '../core/types.js';
import { A2AClient } from '../core/client/client.js';
import type { A2AClientOptions } from '../core/client/client.js';
import { supportsNoise, getSigningPublicKey } from '../crypto/noise/negotiation.js';
import type { PiloxClientConfig } from '../config/types.js';

/**
 * PiloxA2AClient wraps the upstream A2AClient.
 * Adds Noise negotiation detection and Agent Card signature verification.
 */
export class PiloxA2AClient {
  private readonly client: A2AClient;
  private readonly config: PiloxClientConfig;
  private peerIsPilox = false;

  constructor(
    agentCardOrUrl: AgentCard | string,
    config: PiloxClientConfig = {},
    options?: A2AClientOptions,
  ) {
    this.client = new A2AClient(agentCardOrUrl, options);
    this.config = config;
  }

  /** Create client from a remote Agent Card URL */
  static async fromUrl(
    url: string,
    config: PiloxClientConfig = {},
    options?: A2AClientOptions,
  ): Promise<PiloxA2AClient> {
    return new PiloxA2AClient(url, config, options);
  }

  /** Get the remote agent's card */
  async getAgentCard(): Promise<AgentCard> {
    const card = await this.client.getAgentCard();
    this.peerIsPilox = supportsNoise(card);
    return card;
  }

  /** Check if the remote peer supports Pilox extensions */
  isPeerPiloxEnabled(): boolean {
    return this.peerIsPilox;
  }

  /** Send a message to the remote agent */
  async sendMessage(params: MessageSendParams): Promise<SendMessageResponse> {
    return this.client.sendMessage(params);
  }

  /** Stream messages from the remote agent */
  async *sendMessageStream(params: MessageSendParams) {
    yield* this.client.sendMessageStream(params);
  }

  /** Get a task by ID */
  async getTask(params: TaskQueryParams): Promise<GetTaskResponse> {
    return this.client.getTask(params);
  }

  /** Cancel a task */
  async cancelTask(params: TaskIdParams): Promise<CancelTaskResponse> {
    return this.client.cancelTask(params);
  }
}
