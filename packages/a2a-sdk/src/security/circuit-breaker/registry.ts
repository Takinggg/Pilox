import type { CircuitBreakerConfig } from '../../config/types.js';
import { CircuitBreaker } from './breaker.js';

/**
 * Registry of per-agent circuit breakers.
 */
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(private readonly config: CircuitBreakerConfig = {}) {}

  /** Get or create a circuit breaker for the given agent ID */
  getOrCreate(agentId: string): CircuitBreaker {
    let breaker = this.breakers.get(agentId);
    if (!breaker) {
      breaker = new CircuitBreaker(agentId, this.config);
      this.breakers.set(agentId, breaker);
    }
    return breaker;
  }

  /** Remove a breaker for an agent */
  remove(agentId: string): void {
    this.breakers.delete(agentId);
  }

  /** Clear all breakers */
  clear(): void {
    this.breakers.clear();
  }
}
