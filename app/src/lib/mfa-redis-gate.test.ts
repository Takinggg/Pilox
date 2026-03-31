// SPDX-License-Identifier: BUSL-1.1
import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, string>();
const ttlKeys = new Map<string, number>();

const mockRedis = {
  status: "ready" as const,
  connect: vi.fn().mockResolvedValue(undefined),
  set: vi.fn(
    async (key: string, value: string, ...args: unknown[]) => {
      store.set(key, value);
      const exIdx = args.indexOf("EX");
      if (exIdx >= 0 && typeof args[exIdx + 1] === "number") {
        ttlKeys.set(key, args[exIdx + 1] as number);
      }
      return "OK";
    }
  ),
  get: vi.fn(async (key: string) => store.get(key) ?? null),
  del: vi.fn(async (...keys: string[]) => {
    let n = 0;
    for (const k of keys) {
      if (store.delete(k)) n += 1;
      ttlKeys.delete(k);
    }
    return n;
  }),
};

vi.mock("./redis", () => ({
  getRedis: () => mockRedis,
}));

describe("mfa-redis-gate", () => {
  beforeEach(() => {
    store.clear();
    ttlKeys.clear();
    vi.clearAllMocks();
  });

  it("markMfaGateSatisfied sets key with TTL metadata", async () => {
    const { markMfaGateSatisfied, MFA_SESSION_REDIS_PREFIX } = await import("./mfa-redis-gate");
    await markMfaGateSatisfied("user-1");
    expect(store.get(`${MFA_SESSION_REDIS_PREFIX}user-1`)).toBe("1");
    expect(ttlKeys.get(`${MFA_SESSION_REDIS_PREFIX}user-1`)).toBe(4 * 60 * 60);
    expect(mockRedis.set).toHaveBeenCalled();
  });

  it("isMfaGateSatisfied returns true only when flag present", async () => {
    const { isMfaGateSatisfied, markMfaGateSatisfied, clearMfaGate, MFA_SESSION_REDIS_PREFIX } =
      await import("./mfa-redis-gate");
    expect(await isMfaGateSatisfied("u2")).toBe(false);
    await markMfaGateSatisfied("u2");
    expect(await isMfaGateSatisfied("u2")).toBe(true);
    await clearMfaGate("u2");
    expect(store.has(`${MFA_SESSION_REDIS_PREFIX}u2`)).toBe(false);
    expect(await isMfaGateSatisfied("u2")).toBe(false);
  });

  it("clearMfaGate is safe when Redis throws", async () => {
    mockRedis.del.mockRejectedValueOnce(new Error("down"));
    const { clearMfaGate } = await import("./mfa-redis-gate");
    await expect(clearMfaGate("any")).resolves.toBeUndefined();
  });
});
