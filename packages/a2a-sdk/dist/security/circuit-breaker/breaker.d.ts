import type { CircuitBreakerConfig, CircuitState } from '../../config/types.js';
/**
 * Circuit breaker state machine: closed → open → half-open → closed/open.
 */
export declare class CircuitBreaker {
    private readonly agentId;
    private state;
    private failures;
    private successes;
    private lastFailureTime;
    private readonly failureThreshold;
    private readonly resetTimeoutMs;
    private readonly halfOpenSuccessThreshold;
    private readonly onStateChange?;
    constructor(agentId: string, config?: CircuitBreakerConfig);
    /** Check if request should be allowed through */
    canExecute(): boolean;
    /** Record a successful request */
    recordSuccess(): void;
    /** Record a failed request */
    recordFailure(): void;
    getState(): CircuitState;
    getAgentId(): string;
    private transition;
}
//# sourceMappingURL=breaker.d.ts.map