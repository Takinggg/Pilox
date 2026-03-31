import { describe, it, expect } from "vitest";
import { parseMeshWanSystemEventWire } from "./mesh-wan-system-event-wire";

describe("parseMeshWanSystemEventWire", () => {
  it("returns ok:false for non-json", () => {
    expect(parseMeshWanSystemEventWire("")).toEqual({ ok: false });
  });

  it("returns ok:false for other system event types", () => {
    const r = parseMeshWanSystemEventWire(
      JSON.stringify({
        type: "agent.started",
        payload: { agentId: "a", name: "n" },
        timestamp: "2025-01-01T00:00:00.000Z",
      })
    );
    expect(r.ok).toBe(false);
  });

  it("parses mesh.wan.envelope wire", () => {
    const wire = {
      type: "mesh.wan.envelope" as const,
      payload: {
        v: 1 as const,
        correlationId: "wire-test-12345678",
        sourceOrigin: "https://wan.example",
      },
      timestamp: "2026-01-01T12:00:00.000Z",
      meshMeta: {
        v: 1 as const,
        producer: "pilox-core" as const,
        eventId: "550e8400-e29b-41d4-a716-446655440000",
        correlationId: "wire-test-12345678",
      },
    };
    const r = parseMeshWanSystemEventWire(JSON.stringify(wire));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.envelope.correlationId).toBe("wire-test-12345678");
      expect(r.data.eventId).toBe("550e8400-e29b-41d4-a716-446655440000");
      expect(r.data.correlationId).toBe("wire-test-12345678");
    }
  });
});
