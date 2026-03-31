import { TransportProtocolName } from '../core.js';
import { AgentCard } from '../types.js';
import { AgentCardResolver } from './card-resolver.js';
import { Client, ClientConfig } from './multitransport-client.js';
import { TransportFactory } from './transports/transport.js';
export interface ClientFactoryOptions {
    /**
     * Transport factories to use.
     * Effectively defines transports supported by this client factory.
     */
    transports: TransportFactory[];
    /**
     * Client config to be used for clients created by this factory.
     */
    clientConfig?: ClientConfig;
    /**
     * Transport preferences to override ones defined by the agent card.
     * If no matches are found among preferred transports, agent card values are used next.
     */
    preferredTransports?: TransportProtocolName[];
    /**
     * Used for createFromAgentCardUrl to download agent card.
     */
    cardResolver?: AgentCardResolver;
}
export declare const ClientFactoryOptions: {
    /**
     * SDK default options for {@link ClientFactory}.
     */
    default: Readonly<ClientFactoryOptions>;
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
    createFrom(original: ClientFactoryOptions, overrides: Partial<ClientFactoryOptions>): ClientFactoryOptions;
};
export declare class ClientFactory {
    readonly options: ClientFactoryOptions;
    private readonly transportsByName;
    private readonly agentCardResolver;
    constructor(options?: ClientFactoryOptions);
    /**
     * Creates a new client from the provided agent card.
     */
    createFromAgentCard(agentCard: AgentCard): Promise<Client>;
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
    createFromUrl(baseUrl: string, path?: string): Promise<Client>;
}
//# sourceMappingURL=factory.d.ts.map