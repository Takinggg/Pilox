import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { probeFederationAgentCards } from "./mesh-federation-probe";

describe("probeFederationAgentCards", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests agent card on each origin", async () => {
    const r = await probeFederationAgentCards(["https://a.example", "https://b.example"]);
    expect(r).toHaveLength(2);
    expect(r[0].ok).toBe(true);
    expect(r[0].hostname).toBe("a.example");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      "https://a.example/.well-known/agent-card.json"
    );
  });

  it("records failure when fetch throws", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network down"));
    const r = await probeFederationAgentCards(["https://x.example"]);
    expect(r).toHaveLength(1);
    expect(r[0].ok).toBe(false);
    expect(r[0].error).toContain("network down");
  });

  it("returns a row for invalid origin URLs (aligned with origin index)", async () => {
    const r = await probeFederationAgentCards(["not-a-url", "https://ok.example"]);
    expect(r).toHaveLength(2);
    expect(r[0].ok).toBe(false);
    expect(r[0].error).toBeTruthy();
    expect(r[1].ok).toBe(true);
  });
});
