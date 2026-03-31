import type { CircuitBreakerConfig } from '../../config/types.js';
import { CircuitBreaker } from './breaker.js';
/**
 * Registry of per-agent circuit breakers.
 */
export declare class CircuitBreakerRegistry {
    private readonly config;
    private readonly breakers;
    constructor(config?: CircuitBreakerConfig);
    /** Get or create a circuit breaker for the given agent ID */
    getOrCreate(agentId: string): CircuitBreaker;
    /** Remove a breaker for an agent */
    remove(agentId: string): void;
    /** Clear all breakers */
    clear(): void;
}
//# sourceMappingURL=registry.d.ts.map