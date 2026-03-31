import { describe, expect, it } from "vitest";
import {
  buildTraceWaterfallModel,
  isRootParentId,
  normalizeOtelId,
  orderSpansWithDepth,
  parseTempoTracePayload,
  traceWaterfallFromPayload,
} from "./observability-tempo-trace-view";

const LEGACY_BATCH_TRACE = {
  batches: [
    {
      resource: {
        attributes: [
          {
            key: "service.name",
            value: { stringValue: "pilox" },
          },
        ],
      },
      instrumentationLibrarySpans: [
        {
          spans: [
            {
              traceId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              spanId: "1111111111111111",
              name: "GET /api",
              startTimeUnixNano: "1000000000",
              endTimeUnixNano: "5000000000",
            },
            {
              traceId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              spanId: "2222222222222222",
              parentSpanId: "1111111111111111",
              name: "child",
              startTimeUnixNano: "2000000000",
              endTimeUnixNano: "4000000000",
            },
          ],
        },
      ],
    },
  ],
};

const OTLP_RESOURCE_SPANS = {
  resourceSpans: [
    {
      resource: {
        attributes: [{ key: "service.name", value: { stringValue: "api" } }],
      },
      scopeSpans: [
        {
          spans: [
            {
              traceId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              spanId: "aaaaaaaaaaaaaaaa",
              name: "root",
              startTimeUnixNano: "0",
              endTimeUnixNano: "10000000",
            },
          ],
        },
      ],
    },
  ],
};

describe("observability-tempo-trace-view", () => {
  it("normalizeOtelId accepts hex", () => {
    expect(normalizeOtelId("aBcDeF0123456789")).toBe("abcdef0123456789");
    expect(normalizeOtelId("abcd")).toBe("abcd");
  });

  it("isRootParentId", () => {
    expect(isRootParentId(null)).toBe(true);
    expect(isRootParentId("")).toBe(true);
    expect(isRootParentId("0000000000000000")).toBe(true);
    expect(isRootParentId("1111111111111111")).toBe(false);
  });

  it("parseTempoTracePayload reads legacy batches", () => {
    const spans = parseTempoTracePayload(LEGACY_BATCH_TRACE);
    expect(spans).toHaveLength(2);
    expect(spans[0]!.name).toBe("GET /api");
    expect(spans[0]!.parentSpanId).toBeNull();
    expect(spans[1]!.parentSpanId).toBe("1111111111111111");
    expect(spans[0]!.serviceName).toBe("pilox");
  });

  it("parseTempoTracePayload reads resourceSpans", () => {
    const spans = parseTempoTracePayload(OTLP_RESOURCE_SPANS);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.name).toBe("root");
    expect(spans[0]!.serviceName).toBe("api");
  });

  it("parseTempoTracePayload unwraps trace key", () => {
    const wrapped = { trace: LEGACY_BATCH_TRACE };
    expect(parseTempoTracePayload(wrapped)).toHaveLength(2);
  });

  it("orderSpansWithDepth orders parent before child", () => {
    const spans = parseTempoTracePayload(LEGACY_BATCH_TRACE);
    const ord = orderSpansWithDepth(spans);
    expect(ord.map((x) => x.span.name)).toEqual(["GET /api", "child"]);
    expect(ord.map((x) => x.depth)).toEqual([0, 1]);
  });

  it("buildTraceWaterfallModel computes timeline", () => {
    const spans = parseTempoTracePayload(LEGACY_BATCH_TRACE);
    const m = buildTraceWaterfallModel(spans);
    expect(m).not.toBeNull();
    expect(m!.traceDurationMs).toBeCloseTo(4000, 5);
    expect(m!.rows).toHaveLength(2);
    expect(m!.rows[0]!.leftPct).toBe(0);
    expect(m!.rows[0]!.widthPct).toBeCloseTo(100, 0);
    expect(m!.rows[1]!.leftPct).toBeCloseTo(25, 0);
    expect(m!.rows[1]!.widthPct).toBeCloseTo(50, 0);
  });

  it("traceWaterfallFromPayload returns null for empty", () => {
    expect(traceWaterfallFromPayload({})).toBeNull();
    expect(traceWaterfallFromPayload(null)).toBeNull();
  });
});
