import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockAuthorize = vi.fn();
const mockPublish = vi.fn();

vi.mock("@/lib/authorize", () => ({
  authorize: (r: "viewer" | "operator" | "admin") => mockAuthorize(r),
}));

vi.mock("@/lib/redis", () => ({
  publishSystemEvent: (...a: unknown[]) => mockPublish(...a),
}));

import { POST } from "./route";

const envelope = {
  v: 1,
  correlationId: "ingress-test-12345678",
  sourceOrigin: "https://wan.example",
  payload: { note: "t" },
};

describe("POST /api/mesh/wan/ingress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPublish.mockResolvedValue(undefined);
  });

  it("returns 401 when not operator", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await POST(
      new Request("http://h.test/api/mesh/wan/ingress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
      })
    );
    expect(res.status).toBe(401);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("returns 400 when envelope invalid", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: true as const,
      session: null,
      user: { id: "system" },
      role: "operator" as const,
      ip: "127.0.0.1",
      authSource: "internal" as const,
    });
    const res = await POST(
      new Request("http://h.test/api/mesh/wan/ingress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ v: 1, correlationId: "short", sourceOrigin: "not-url" }),
      })
    );
    expect(res.status).toBe(400);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("returns 202 and publishes mesh.wan.envelope", async () => {
    mockAuthorize.mockResolvedValue({
      authorized: true as const,
      session: null,
      user: { id: "system" },
      role: "operator" as const,
      ip: "127.0.0.1",
      authSource: "internal" as const,
    });
    const res = await POST(
      new Request("http://h.test/api/mesh/wan/ingress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
      })
    );
    expect(res.status).toBe(202);
    const j = (await res.json()) as { accepted: boolean; correlationId: string };
    expect(j.accepted).toBe(true);
    expect(j.correlationId).toBe(envelope.correlationId);
    expect(mockPublish).toHaveBeenCalledTimes(1);
    const [ev, opts] = mockPublish.mock.calls[0] as [
      { type: string; payload: typeof envelope; timestamp: string },
      { correlationId?: string },
    ];
    expect(ev.type).toBe("mesh.wan.envelope");
    expect(ev.payload.correlationId).toBe(envelope.correlationId);
    expect(opts.correlationId).toBe(envelope.correlationId);
  });
});
