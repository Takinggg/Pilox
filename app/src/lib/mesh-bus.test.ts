import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentStatusEvent } from "./mesh-events";

vi.mock("@/lib/env", () => ({
  env: vi.fn(() => ({
    MESH_BUS_HMAC_SECRET: undefined as string | undefined,
  })),
}));

const { mockPublish, MockRedis } = vi.hoisted(() => {
  const mockPublish = vi.fn().mockResolvedValue(1);
  class MockRedis {
    status = "ready" as const;
    connect = vi.fn().mockResolvedValue(undefined);
    publish = mockPublish;
    on = vi.fn();
    quit = vi.fn().mockResolvedValue("OK");
    scan = vi.fn().mockResolvedValue(["0", []]);
    get = vi.fn();
    set = vi.fn();
    del = vi.fn();
    constructor(..._args: unknown[]) {
      void _args;
    }
  }
  return { mockPublish, MockRedis };
});

vi.mock("ioredis", () => ({
  Redis: MockRedis,
  default: MockRedis,
}));

describe("mesh Redis bus (publish path)", () => {
  beforeEach(() => {
    vi.resetModules();
    mockPublish.mockClear();
  });

  it("publishAgentStatus sends sealed JSON on pilox:agent:status", async () => {
    const { publishAgentStatus } = await import("./redis");
    await publishAgentStatus({
      agentId: "agent-1",
      status: "running",
      timestamp: "2025-01-01T00:00:00.000Z",
    });
    expect(mockPublish).toHaveBeenCalledTimes(1);
    const [, raw] = mockPublish.mock.calls[0];
    const body = JSON.parse(raw as string);
    expect(body.agentId).toBe("agent-1");
    expect(body.status).toBe("running");
    expect(body.meshMeta.v).toBe(1);
    expect(body.meshMeta.producer).toBe("pilox-core");
    expect(typeof body.meshMeta.eventId).toBe("string");
  });

  it("publishAgentStatus attaches correlationId when provided", async () => {
    const { publishAgentStatus } = await import("./redis");
    await publishAgentStatus(
      {
        agentId: "agent-1",
        status: "running",
        timestamp: "2025-01-01T00:00:00.000Z",
      },
      { correlationId: "cid-trace-1" }
    );
    const body = JSON.parse(mockPublish.mock.calls[0][1] as string);
    expect(body.meshMeta.correlationId).toBe("cid-trace-1");
  });

  it("publishSystemEvent sends sealed JSON on pilox:system:events", async () => {
    const { publishSystemEvent } = await import("./redis");
    const ev = {
      type: "agent.started" as const,
      payload: { agentId: "x", name: "Agent X" },
      timestamp: "2025-01-01T00:00:00.000Z",
    };
    await publishSystemEvent(ev);
    expect(mockPublish).toHaveBeenCalledWith(
      "pilox:system:events",
      expect.any(String)
    );
    const body = JSON.parse(mockPublish.mock.calls[0][1] as string);
    expect(body.type).toBe("agent.started");
    expect(body.payload.name).toBe("Agent X");
    expect(body.meshMeta.producer).toBe("pilox-core");
  });

  it("publishSystemEvent publishes mesh.wan.envelope", async () => {
    const { publishSystemEvent } = await import("./redis");
    await publishSystemEvent(
      {
        type: "mesh.wan.envelope",
        payload: {
          v: 1,
          correlationId: "bus-wan-12345678",
          sourceOrigin: "https://wan.example",
        },
        timestamp: "2025-01-01T00:00:00.000Z",
      },
      { correlationId: "bus-wan-12345678" }
    );
    expect(mockPublish).toHaveBeenCalledWith(
      "pilox:system:events",
      expect.any(String)
    );
    const body = JSON.parse(mockPublish.mock.calls[0][1] as string);
    expect(body.type).toBe("mesh.wan.envelope");
    expect(body.payload.correlationId).toBe("bus-wan-12345678");
  });

  it("publishAgentStatus does not call Redis when schema fails", async () => {
    const { publishAgentStatus } = await import("./redis");
    const bad = {
      agentId: "a",
      status: "invalid-status",
      timestamp: "2025-01-01T00:00:00.000Z",
    } as unknown as AgentStatusEvent;
    await publishAgentStatus(bad);
    expect(mockPublish).not.toHaveBeenCalled();
  });
});
