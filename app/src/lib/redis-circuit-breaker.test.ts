import { describe, it, expect, beforeEach } from "vitest";
import { withCircuitBreaker, isCircuitOpen, recordFailure, recordSuccess } from "./redis-circuit-breaker";

describe("redis-circuit-breaker", () => {
  beforeEach(() => {
    // Reset state by recording success
    recordSuccess();
  });

  it("passes through successful operations", async () => {
    const result = await withCircuitBreaker(async () => "ok", "fallback");
    expect(result).toBe("ok");
  });

  it("returns fallback on operation failure", async () => {
    const result = await withCircuitBreaker(async () => {
      throw new Error("Redis down");
    }, "fallback");
    expect(result).toBe("fallback");
  });

  it("opens circuit after 5 consecutive failures", async () => {
    for (let i = 0; i < 5; i++) {
      recordFailure();
    }
    expect(isCircuitOpen()).toBe(true);

    // All calls return fallback immediately
    const result = await withCircuitBreaker(async () => "should-not-run", "fallback");
    expect(result).toBe("fallback");
  });

  it("resets after success", async () => {
    for (let i = 0; i < 4; i++) {
      recordFailure();
    }
    expect(isCircuitOpen()).toBe(false); // not yet at threshold
    recordSuccess();
    recordFailure(); // 1st failure after reset
    expect(isCircuitOpen()).toBe(false);
  });
});
