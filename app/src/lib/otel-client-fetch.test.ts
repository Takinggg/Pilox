import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { meshOutboundFetch } from "./otel-client-fetch";

describe("meshOutboundFetch", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 }))
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls fetch with merged headers", async () => {
    await meshOutboundFetch("test.span", "https://peer.example/x", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(init.method).toBe("GET");
    const h = init.headers as Record<string, string>;
    expect(h.accept).toBe("application/json");
  });
});
