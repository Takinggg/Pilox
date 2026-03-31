import { AgentCard } from '../types.js';
export interface AgentCardResolverOptions {
    path?: string;
    fetchImpl?: typeof fetch;
}
export interface AgentCardResolver {
    /**
     * Fetches the agent card based on provided base URL and path,
     */
    resolve(baseUrl: string, path?: string): Promise<AgentCard>;
}
export declare class DefaultAgentCardResolver implements AgentCardResolver {
    readonly options?: AgentCardResolverOptions;
    constructor(options?: AgentCardResolverOptions);
    /**
     * Fetches the agent card based on provided base URL and path.
     * Path is selected in the following order:
     * 1) path parameter
     * 2) path from options
     * 3) .well-known/agent-card.json
     */
    resolve(baseUrl: string, path?: string): Promise<AgentCard>;
    private fetchImpl;
    private normalizeAgentCard;
    private isProtoAgentCard;
    private hasProtoSecurity;
    private hasProtoSecuritySchemes;
}
export declare const AgentCardResolver: {
    default: DefaultAgentCardResolver;
};
//# sourceMappingURL=card-resolver.d.ts.map