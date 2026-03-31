// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock dependencies (vi.hoisted to survive hoisting) ──

const { mockDb } = vi.hoisted(() => {
  const _mockDb = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => [{
            id: "agent-1",
            instanceIp: "10.0.0.5",
            port: 11434,
            status: "running",
          }]),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  };
  return { mockDb: _mockDb };
});

vi.mock("@/db", () => ({ db: mockDb }));
vi.mock("@/db/schema", () => ({
  agents: { id: "id", instanceIp: "instanceIp", port: "port", status: "status" },
  workflowRuns: { id: "id" },
}));
vi.mock("./logger", () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock fetch for agent calls
const fetchSpy = vi.fn().mockResolvedValue(
  new Response(JSON.stringify({ message: { content: "Hello from agent" } }), { status: 200 }),
);
vi.stubGlobal("fetch", fetchSpy);

import { executeWorkflow, type WorkflowGraph } from "./workflow-executor";
import { isPiloxWorkflowCodeNodeDisabledByEnv } from "./workflow-code-node-policy";

// ── Tests ────────────────────────────────────────────

describe("executeWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ message: { content: "Hello from agent" } }), { status: 200 }),
    );
    // Reset mockDb.select to default
    mockDb.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => [{
            id: "agent-1",
            instanceIp: "10.0.0.5",
            port: 11434,
            status: "running",
          }]),
        })),
      })),
    } as any);
  });

  it("executes a simple start→agent→end graph", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: "s1", type: "start", data: {} },
        { id: "a1", type: "agent", data: { agentId: "agent-1" } },
        { id: "e1", type: "end", data: {} },
      ],
      edges: [
        { id: "e1e", source: "s1", target: "a1" },
        { id: "e2e", source: "a1", target: "e1" },
      ],
    };

    const result = await executeWorkflow("run-1", graph, { input: "test" });
    expect(result.status).toBe("completed");
    expect(result.steps).toHaveLength(3); // start + agent + end
    expect(result.steps[1].status).toBe("success");
    expect(result.output.lastOutput).toBe("Hello from agent");
  });

  it("fails on empty graph", async () => {
    const graph: WorkflowGraph = { nodes: [], edges: [] };
    const result = await executeWorkflow("run-2", graph, {});
    expect(result.status).toBe("failed");
    expect(result.error).toContain("no nodes");
  });

  it("handles router node with condition", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: "s1", type: "start", data: {} },
        { id: "r1", type: "router", data: { condition: "status == 'ok'" } },
        { id: "a1", type: "agent", data: { agentId: "agent-1", label: "Good path" } },
        { id: "a2", type: "agent", data: { agentId: "agent-1", label: "Bad path" } },
        { id: "e1", type: "end", data: {} },
      ],
      edges: [
        { id: "e1e", source: "s1", target: "r1" },
        { id: "e2e", source: "r1", target: "a1", data: { condition: "true" } },
        { id: "e3e", source: "r1", target: "a2", data: { condition: "false" } },
        { id: "e4e", source: "a1", target: "e1" },
        { id: "e5e", source: "a2", target: "e1" },
      ],
    };

    const result = await executeWorkflow("run-3", graph, { status: "ok" });
    expect(result.status).toBe("completed");
    const agentSteps = result.steps.filter((s) => s.nodeType === "agent");
    expect(agentSteps).toHaveLength(1);
  });

  it("handles transform node with template substitution", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: "s1", type: "start", data: {} },
        { id: "t1", type: "transform", data: {
          template: "Hello {{name}}, you have {{count}} items",
          outputVariable: "greeting",
        }},
        { id: "e1", type: "end", data: {} },
      ],
      edges: [
        { id: "e1e", source: "s1", target: "t1" },
        { id: "e2e", source: "t1", target: "e1" },
      ],
    };

    const result = await executeWorkflow("run-4", graph, { name: "Alice", count: 5 });
    expect(result.status).toBe("completed");
    expect(result.output.greeting).toBe("Hello Alice, you have 5 items");
  });

  it("applies variable mapping on edges", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: "s1", type: "start", data: {} },
        { id: "t1", type: "transform", data: { template: "{{sourceData}}" } },
        { id: "e1", type: "end", data: {} },
      ],
      edges: [
        { id: "e1e", source: "s1", target: "t1", data: { variableMap: { sourceData: "input" } } },
        { id: "e2e", source: "t1", target: "e1" },
      ],
    };

    const result = await executeWorkflow("run-5", graph, { input: "mapped-value" });
    expect(result.status).toBe("completed");
    expect(result.output.step_t1).toBe("mapped-value");
  });

  it("stops at MAX_STEPS for infinite loops", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: "s1", type: "start", data: {} },
        { id: "t1", type: "transform", data: { action: "passthrough" } },
      ],
      edges: [
        { id: "e1e", source: "s1", target: "t1" },
        { id: "e2e", source: "t1", target: "t1" }, // loop
      ],
    };

    const result = await executeWorkflow("run-6", graph, {});
    expect(result.status).toBe("failed");
    expect(result.error).toContain("Max steps");
  });

  it("fails when agent is not running", async () => {
    mockDb.select.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => [{
            id: "agent-1",
            instanceIp: "10.0.0.5",
            port: 11434,
            status: "stopped",
          }]),
        })),
      })),
    } as any);

    const graph: WorkflowGraph = {
      nodes: [
        { id: "s1", type: "start", data: {} },
        { id: "a1", type: "agent", data: { agentId: "agent-1" } },
        { id: "e1", type: "end", data: {} },
      ],
      edges: [
        { id: "e1e", source: "s1", target: "a1" },
        { id: "e2e", source: "a1", target: "e1" },
      ],
    };

    const result = await executeWorkflow("run-7", graph, {});
    expect(result.status).toBe("failed");
    expect(result.error).toContain("stopped");
  });

  it("retries on agent failure with maxRetries", async () => {
    // First call fails, second succeeds
    fetchSpy
      .mockResolvedValueOnce(new Response("error", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: { content: "ok" } }), { status: 200 }),
      );

    const graph: WorkflowGraph = {
      nodes: [
        { id: "s1", type: "start", data: {} },
        { id: "a1", type: "agent", data: { agentId: "agent-1", maxRetries: 1, timeoutSeconds: 5 } },
        { id: "e1", type: "end", data: {} },
      ],
      edges: [
        { id: "e1e", source: "s1", target: "a1" },
        { id: "e2e", source: "a1", target: "e1" },
      ],
    };

    const result = await executeWorkflow("run-8", graph, {});
    expect(result.status).toBe("completed");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("blocks HTTP node to private/loopback URLs (SSRF policy)", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: "s1", type: "start", data: {} },
        { id: "h1", type: "http", data: { url: "http://127.0.0.1/api", method: "GET" } },
        { id: "e1", type: "end", data: {} },
      ],
      edges: [
        { id: "e1e", source: "s1", target: "h1" },
        { id: "e2e", source: "h1", target: "e1" },
      ],
    };

    const result = await executeWorkflow("run-http-ssrf", graph, {});
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/blocked|literal_private_ip|egress policy/i);
  });

  it("fails HTTP node on non-2xx response", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "nope" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      }),
    );

    const graph: WorkflowGraph = {
      nodes: [
        { id: "s1", type: "start", data: {} },
        { id: "h1", type: "http", data: { url: "https://example.com/api", method: "GET" } },
        { id: "e1", type: "end", data: {} },
      ],
      edges: [
        { id: "e1e", source: "s1", target: "h1" },
        { id: "e2e", source: "h1", target: "e1" },
      ],
    };

    const result = await executeWorkflow("run-http-non-2xx", graph, {});
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/returned 502/i);
  });

  it("fails HTTP node when JSON parsing throws", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("{not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const graph: WorkflowGraph = {
      nodes: [
        { id: "s1", type: "start", data: {} },
        { id: "h1", type: "http", data: { url: "https://example.com/api", method: "GET" } },
        { id: "e1", type: "end", data: {} },
      ],
      edges: [
        { id: "e1e", source: "s1", target: "h1" },
        { id: "e2e", source: "h1", target: "e1" },
      ],
    };

    const result = await executeWorkflow("run-http-bad-json", graph, {});
    expect(result.status).toBe("failed");
    expect(result.error?.toLowerCase()).toMatch(/json|parse|unexpected/i);
  });

  it("fails HTTP node when request times out", async () => {
    vi.useFakeTimers();
    fetchSpy.mockImplementationOnce((_url: string, opts?: RequestInit) => {
      const signal = opts?.signal as AbortSignal | undefined;
      return new Promise<Response>((_resolve, reject) => {
        if (signal?.aborted) {
          reject(new Error("aborted"));
          return;
        }
        signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });

    try {
      const graph: WorkflowGraph = {
        nodes: [
          { id: "s1", type: "start", data: {} },
          {
            id: "h1",
            type: "http",
            data: { url: "https://example.com/api", method: "GET", timeoutSeconds: 0.001 },
          },
          { id: "e1", type: "end", data: {} },
        ],
        edges: [
          { id: "e1e", source: "s1", target: "h1" },
          { id: "e2e", source: "h1", target: "e1" },
        ],
      };

      const p = executeWorkflow("run-http-timeout", graph, {});
      await vi.advanceTimersByTimeAsync(50);
      const result = await p;
      expect(result.status).toBe("failed");
      expect(result.error?.toLowerCase()).toMatch(/abort|timeout/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails JavaScript code node when NODE_ENV is production and override unset", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.PILOX_WORKFLOW_DISABLE_CODE_NODE;
    try {
      const graph: WorkflowGraph = {
        nodes: [
          { id: "s1", type: "start", data: {} },
          {
            id: "c1",
            type: "code",
            data: { codeContent: "return 1", language: "javascript" },
          },
          { id: "e1", type: "end", data: {} },
        ],
        edges: [
          { id: "x1", source: "s1", target: "c1" },
          { id: "x2", source: "c1", target: "e1" },
        ],
      };
      const result = await executeWorkflow("run-code-prod-default", graph, {});
      expect(result.status).toBe("failed");
      expect(result.error).toMatch(/disabled/i);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("isPiloxWorkflowCodeNodeDisabledByEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is false when unset in test", () => {
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.PILOX_WORKFLOW_DISABLE_CODE_NODE;
    expect(isPiloxWorkflowCodeNodeDisabledByEnv()).toBe(false);
  });

  it("is true when unset in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.PILOX_WORKFLOW_DISABLE_CODE_NODE;
    expect(isPiloxWorkflowCodeNodeDisabledByEnv()).toBe(true);
  });

  it("is true when set true in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PILOX_WORKFLOW_DISABLE_CODE_NODE", "true");
    expect(isPiloxWorkflowCodeNodeDisabledByEnv()).toBe(true);
  });

  it("is false when set false in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PILOX_WORKFLOW_DISABLE_CODE_NODE", "false");
    expect(isPiloxWorkflowCodeNodeDisabledByEnv()).toBe(false);
  });
});
