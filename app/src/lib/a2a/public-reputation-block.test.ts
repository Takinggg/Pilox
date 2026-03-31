import { describe, it, expect, beforeEach, vi } from "vitest";

const mget = vi.fn();

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    status: "ready" as const,
    connect: vi.fn().mockResolvedValue(undefined),
    mget,
  }),
}));

import { enforcePublicReputationBlockIfNeeded } from "./public-reputation-block";

const baseEnv = {
  A2A_PUBLIC_JSONRPC_REPUTATION_ENABLED: true,
  A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_ENABLED: true,
  A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_BAD_EVENT_THRESHOLD: 100,
  A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_RETRY_AFTER_SECONDS: 1800,
} as const;

describe("enforcePublicReputationBlockIfNeeded", () => {
  beforeEach(() => {
    mget.mockReset();
  });

  it("returns undefined when block is disabled", async () => {
    const r = await enforcePublicReputationBlockIfNeeded(
      { ...baseEnv, A2A_PUBLIC_JSONRPC_REPUTATION_BLOCK_ENABLED: false },
      "deadbeef"
    );
    expect(r).toBeUndefined();
    expect(mget).not.toHaveBeenCalled();
  });

  it("returns undefined when repHash is null", async () => {
    const r = await enforcePublicReputationBlockIfNeeded(baseEnv, null);
    expect(r).toBeUndefined();
    expect(mget).not.toHaveBeenCalled();
  });

  it("allows when sum of counters is below threshold", async () => {
    mget.mockResolvedValue(["40", "50"]);
    const r = await enforcePublicReputationBlockIfNeeded(baseEnv, "abc");
    expect(r).toBeUndefined();
    expect(mget).toHaveBeenCalledTimes(1);
  });

  it("returns 429 JSON-RPC when sum meets threshold", async () => {
    mget.mockResolvedValue(["60", "45"]);
    const res = await enforcePublicReputationBlockIfNeeded(baseEnv, "abc");
    expect(res?.status).toBe(429);
    const j = (await res!.json()) as {
      jsonrpc: string;
      error: { code: number };
    };
    expect(j.jsonrpc).toBe("2.0");
    expect(j.error.code).toBe(-32005);
    expect(res!.headers.get("Retry-After")).toBe("1800");
  });

  it("fails open when Redis mget throws", async () => {
    mget.mockRejectedValue(new Error("redis down"));
    const r = await enforcePublicReputationBlockIfNeeded(baseEnv, "abc");
    expect(r).toBeUndefined();
  });
});
