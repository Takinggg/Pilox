import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker } from '../../../src/security/circuit-breaker/breaker.js';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in closed state', () => {
    const cb = new CircuitBreaker('agent-1');
    expect(cb.getState()).toBe('closed');
    expect(cb.canExecute()).toBe(true);
  });

  it('opens after reaching failure threshold', () => {
    const cb = new CircuitBreaker('agent-1', { failureThreshold: 3 });

    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('closed');

    cb.recordFailure();
    expect(cb.getState()).toBe('open');
    expect(cb.canExecute()).toBe(false);
  });

  it('transitions to half-open after reset timeout', () => {
    const cb = new CircuitBreaker('agent-1', {
      failureThreshold: 2,
      resetTimeoutMs: 5000,
    });

    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('open');

    vi.advanceTimersByTime(5000);
    expect(cb.canExecute()).toBe(true);
    expect(cb.getState()).toBe('half-open');
  });

  it('closes after successes in half-open state', () => {
    const cb = new CircuitBreaker('agent-1', {
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      halfOpenSuccessThreshold: 2,
    });

    cb.recordFailure();
    expect(cb.getState()).toBe('open');

    vi.advanceTimersByTime(1000);
    cb.canExecute(); // triggers half-open
    expect(cb.getState()).toBe('half-open');

    cb.recordSuccess();
    expect(cb.getState()).toBe('half-open');

    cb.recordSuccess();
    expect(cb.getState()).toBe('closed');
  });

  it('re-opens on failure in half-open state', () => {
    const cb = new CircuitBreaker('agent-1', {
      failureThreshold: 1,
      resetTimeoutMs: 1000,
    });

    cb.recordFailure();
    vi.advanceTimersByTime(1000);
    cb.canExecute(); // half-open

    cb.recordFailure();
    expect(cb.getState()).toBe('open');
  });

  it('calls onStateChange callback', () => {
    const changes: Array<{ from: string; to: string }> = [];
    const cb = new CircuitBreaker('agent-1', {
      failureThreshold: 1,
      onStateChange: (_id, from, to) => changes.push({ from, to }),
    });

    cb.recordFailure();
    expect(changes).toEqual([{ from: 'closed', to: 'open' }]);
  });

  it('resets failure count on success in closed state', () => {
    const cb = new CircuitBreaker('agent-1', { failureThreshold: 3 });

    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess(); // resets count

    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('closed'); // only 2 failures after reset
  });
});
