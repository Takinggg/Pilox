import type { CircuitBreakerConfig, CircuitState } from '../../config/types.js';

/**
 * Circuit breaker state machine: closed → open → half-open → closed/open.
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenSuccessThreshold: number;
  private readonly onStateChange?: (agentId: string, from: CircuitState, to: CircuitState) => void;

  constructor(
    private readonly agentId: string,
    config: CircuitBreakerConfig = {},
  ) {
    this.failureThreshold = config.failureThreshold ?? 5;
    this.resetTimeoutMs = config.resetTimeoutMs ?? 30_000;
    this.halfOpenSuccessThreshold = config.halfOpenSuccessThreshold ?? 2;
    this.onStateChange = config.onStateChange;
  }

  /** Check if request should be allowed through */
  canExecute(): boolean {
    if (this.state === 'closed') return true;

    if (this.state === 'open') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.resetTimeoutMs) {
        this.transition('half-open');
        return true;
      }
      return false;
    }

    // half-open: allow requests to test recovery
    return true;
  }

  /** Record a successful request */
  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.halfOpenSuccessThreshold) {
        this.transition('closed');
      }
    }
    if (this.state === 'closed') {
      this.failures = 0;
    }
  }

  /** Record a failed request */
  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.transition('open');
      return;
    }

    if (this.state === 'closed' && this.failures >= this.failureThreshold) {
      this.transition('open');
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getAgentId(): string {
    return this.agentId;
  }

  private transition(to: CircuitState): void {
    const from = this.state;
    this.state = to;
    this.successes = 0;
    if (to === 'closed') {
      this.failures = 0;
    }
    this.onStateChange?.(this.agentId, from, to);
  }
}
