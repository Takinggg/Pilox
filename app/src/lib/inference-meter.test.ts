// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies (vi.hoisted to survive hoisting) ──

const { mockTx, mockDb, mockRedis } = vi.hoisted(() => {
  const _mockTx = {
    insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  };

  const _mockDb = {
    transaction: vi.fn((fn: (tx: typeof _mockTx) => Promise<void>) => fn(_mockTx)),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => [{ totalCost: "5.00" }]),
      })),
    })),
  };

  const _mockRedis = {
    incrby: vi.fn(() => Promise.resolve(100)),
    expire: vi.fn(() => Promise.resolve()),
    get: vi.fn((): Promise<string | null> => Promise.resolve(null)),
    set: vi.fn(() => Promise.resolve()),
  };

  return { mockTx: _mockTx, mockDb: _mockDb, mockRedis: _mockRedis };
});

vi.mock("@/db", () => ({ db: mockDb }));
vi.mock("@/db/schema", () => ({
  agents: {
    id: "id",
    totalTokensIn: "totalTokensIn",
    totalTokensOut: "totalTokensOut",
    lastActiveAt: "lastActiveAt",
    updatedAt: "updatedAt",
    budgetMaxTokensDay: "budgetMaxTokensDay",
    budgetMaxCostMonth: "budgetMaxCostMonth",
    budgetAlertWebhook: "budgetAlertWebhook",
  },
  inferenceUsage: {
    agentId: "agentId",
    costUsd: "costUsd",
    createdAt: "createdAt",
  },
}));

vi.mock("./redis", () => ({
  getRedis: () => mockRedis,
}));

vi.mock("./logger", () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ── Import after mocks ──────────────────────────────

import {
  recordInferenceUsage,
  recordInferenceUsageWithCost,
  checkBudget,
} from "./inference-meter";

// ── Tests ────────────────────────────────────────────

describe("recordInferenceUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records usage in a transaction", async () => {
    await recordInferenceUsage({
      agentId: "a1",
      model: "llama3.2",
      tokensIn: 100,
      tokensOut: 50,
      durationMs: 200,
    });

    expect(mockDb.transaction).toHaveBeenCalledOnce();
    expect(mockTx.insert).toHaveBeenCalled();
    expect(mockTx.update).toHaveBeenCalled();
  });

  it("does not throw on DB errors (fire-and-forget)", async () => {
    mockDb.transaction.mockRejectedValueOnce(new Error("DB down"));

    await expect(
      recordInferenceUsage({
        agentId: "a1",
        model: "m",
        tokensIn: 10,
        tokensOut: 5,
        durationMs: 100,
      }),
    ).resolves.toBeUndefined();
  });

  it("skips agent update when tokens are zero", async () => {
    await recordInferenceUsage({
      agentId: "a1",
      model: "m",
      tokensIn: 0,
      tokensOut: 0,
      durationMs: 50,
    });

    expect(mockTx.insert).toHaveBeenCalled();
    expect(mockTx.update).not.toHaveBeenCalled();
  });
});

describe("recordInferenceUsageWithCost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records usage with cost and updates Redis counter", async () => {
    await recordInferenceUsageWithCost({
      agentId: "a1",
      model: "gpt-4o",
      tokensIn: 500,
      tokensOut: 200,
      durationMs: 1000,
      costUsd: 0.005,
      providerType: "openai",
    });

    expect(mockDb.transaction).toHaveBeenCalledOnce();
    expect(mockRedis.incrby).toHaveBeenCalledWith(
      expect.stringContaining("pilox:budget:daily:a1:"),
      700,
    );
    expect(mockRedis.expire).toHaveBeenCalled();
  });

  it("does not throw on Redis failure", async () => {
    mockRedis.incrby.mockRejectedValueOnce(new Error("Redis down"));

    await expect(
      recordInferenceUsageWithCost({
        agentId: "a1",
        model: "gpt-4o",
        tokensIn: 100,
        tokensOut: 50,
        durationMs: 500,
        costUsd: 0.001,
        providerType: "openai",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("checkBudget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows when no budget limits set", async () => {
    const result = await checkBudget({
      id: "a1",
      budgetMaxTokensDay: null,
      budgetMaxCostMonth: null,
      budgetAlertWebhook: null,
    });
    expect(result.allowed).toBe(true);
  });

  it("blocks when daily token limit exceeded", async () => {
    mockRedis.get.mockResolvedValueOnce("10000");

    const result = await checkBudget({
      id: "a1",
      budgetMaxTokensDay: 5000,
      budgetMaxCostMonth: null,
      budgetAlertWebhook: null,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Daily token budget exceeded");
  });

  it("allows when daily tokens under limit", async () => {
    mockRedis.get.mockResolvedValueOnce("1000");

    const result = await checkBudget({
      id: "a1",
      budgetMaxTokensDay: 5000,
      budgetMaxCostMonth: null,
      budgetAlertWebhook: null,
    });

    expect(result.allowed).toBe(true);
  });

  it("blocks when monthly cost exceeded", async () => {
    mockDb.select.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => [{ totalCost: "15.00" }]),
      })),
    } as any);

    const result = await checkBudget({
      id: "a1",
      budgetMaxTokensDay: null,
      budgetMaxCostMonth: "10.00",
      budgetAlertWebhook: null,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Monthly cost budget exceeded");
  });

  it("fail-open on Redis error", async () => {
    mockRedis.get.mockRejectedValueOnce(new Error("Redis down"));

    const result = await checkBudget({
      id: "a1",
      budgetMaxTokensDay: 5000,
      budgetMaxCostMonth: null,
      budgetAlertWebhook: null,
    });

    expect(result.allowed).toBe(true);
  });

  it("fail-open on DB error for monthly check", async () => {
    mockDb.select.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => { throw new Error("DB down"); }),
      })),
    } as any);

    const result = await checkBudget({
      id: "a1",
      budgetMaxTokensDay: null,
      budgetMaxCostMonth: "10.00",
      budgetAlertWebhook: null,
    });

    expect(result.allowed).toBe(true);
  });
});
