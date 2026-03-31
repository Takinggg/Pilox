import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeTempoBase, tempoSearch, tempoTraceById } from "./observability-tempo";

describe("observability-tempo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("normalizeTempoBase", () => {
    expect(normalizeTempoBase("http://tempo:3200/")).toBe("http://tempo:3200");
  });

  it("tempoSearch builds URL and parses JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ traces: [{ traceID: "abcd" }] }),
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await tempoSearch("http://tempo:3200/", {
      startSec: 10,
      endSec: 20,
      limit: 15,
      serviceName: "pilox",
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.traces?.[0]?.traceID).toBe("abcd");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("/api/search");
    expect(url).toContain("start=10");
    expect(url).toContain("end=20");
    expect(url).toContain("limit=15");
    const u = new URL(url);
    expect(u.searchParams.get("tags")).toBe("service.name=pilox");
  });

  it("tempoSearch returns error on non-OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "boom",
        json: async () => ({}),
      })
    );
    const r = await tempoSearch("http://t/", {
      startSec: 0,
      endSec: 1,
      limit: 5,
      serviceName: "x",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(500);
      expect(r.error).toContain("boom");
    }
  });

  it("tempoTraceById rejects invalid id", async () => {
    const r = await tempoTraceById("http://t/", "zzz", {
      startSec: 0,
      endSec: 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/invalid/i);
  });

  it("tempoTraceById fetches trace JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resourceSpans: [] }),
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await tempoTraceById("http://tempo:3200", "a1b2c3d4e5f67890", {
      startSec: 100,
      endSec: 200,
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ resourceSpans: [] });

    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("/api/traces/a1b2c3d4e5f67890");
    expect(url).toContain("start=100");
    expect(url).toContain("end=200");
  });
});
