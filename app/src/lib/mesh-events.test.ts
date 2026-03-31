import { describe, it, expect } from "vitest";
import {
  agentStatusEventSchema,
  systemEventSchema,
} from "./mesh-events";

describe("mesh-events schemas", () => {
  it("accepts a valid agent status event", () => {
    const r = agentStatusEventSchema.safeParse({
      agentId: "a1",
      status: "running",
      timestamp: "2025-01-01T00:00:00.000Z",
      instanceId: "vm-1",
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown agent status", () => {
    const r = agentStatusEventSchema.safeParse({
      agentId: "a1",
      status: "bogus",
      timestamp: "2025-01-01T00:00:00.000Z",
    });
    expect(r.success).toBe(false);
  });

  it("accepts agent.paused with idle reason", () => {
    const r = systemEventSchema.safeParse({
      type: "agent.paused",
      payload: {
        agentId: "a1",
        name: "n",
        reason: "idle",
      },
      timestamp: "2025-01-01T00:00:00.000Z",
    });
    expect(r.success).toBe(true);
  });

  it("rejects system event with wrong payload shape", () => {
    const r = systemEventSchema.safeParse({
      type: "agent.started",
      payload: { agentId: "a1" },
      timestamp: "2025-01-01T00:00:00.000Z",
    });
    expect(r.success).toBe(false);
  });

  it("accepts mesh.wan.envelope system event", () => {
    const r = systemEventSchema.safeParse({
      type: "mesh.wan.envelope",
      payload: {
        v: 1,
        correlationId: "wan-ev-12345678",
        sourceOrigin: "https://peer.example",
        payload: { x: 1 },
      },
      timestamp: "2025-01-01T00:00:00.000Z",
    });
    expect(r.success).toBe(true);
  });
});
