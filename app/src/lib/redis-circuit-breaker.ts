// SPDX-License-Identifier: BUSL-1.1
import { createModuleLogger } from "./logger";

const log = createModuleLogger("redis-circuit-breaker");

/**
 * Simple circuit breaker for Redis operations.
 * After `threshold` consecutive failures, the circuit opens for `cooldownMs`
 * and all calls return the fallback immediately (no Redis hit).
 */

let consecutiveFailures = 0;
let circuitOpenUntil = 0;
const FAILURE_THRESHOLD = 5;
const COOLDOWN_MS = 30_000; // 30 seconds

export function isCircuitOpen(): boolean {
  if (Date.now() < circuitOpenUntil) return true;
  if (circuitOpenUntil > 0 && Date.now() >= circuitOpenUntil) {
    // Half-open: allow one probe
    circuitOpenUntil = 0;
    consecutiveFailures = 0;
    log.info("redis_circuit_half_open", { msg: "Allowing probe request" });
  }
  return false;
}

export function recordSuccess(): void {
  if (consecutiveFailures > 0) {
    log.info("redis_circuit_recovered", { previousFailures: consecutiveFailures });
  }
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
}

export function recordFailure(): void {
  consecutiveFailures++;
  if (consecutiveFailures >= FAILURE_THRESHOLD && circuitOpenUntil === 0) {
    circuitOpenUntil = Date.now() + COOLDOWN_MS;
    log.warn("redis_circuit_open", {
      failures: consecutiveFailures,
      cooldownMs: COOLDOWN_MS,
      msg: "Circuit breaker opened — Redis calls will be skipped",
    });
  }
}

/**
 * Wrap a Redis operation with circuit breaker.
 * Returns fallback value when circuit is open or operation fails.
 */
export async function withCircuitBreaker<T>(
  operation: () => Promise<T>,
  fallback: T,
): Promise<T> {
  if (isCircuitOpen()) return fallback;

  try {
    const result = await operation();
    recordSuccess();
    return result;
  } catch (err) {
    recordFailure();
    log.warn("redis_operation_failed", {
      error: err instanceof Error ? err.message : String(err),
      consecutiveFailures,
    });
    return fallback;
  }
}
