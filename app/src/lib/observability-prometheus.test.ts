import { describe, expect, it } from "vitest";
import {
  isObservabilityPreset,
  promMatrixToSeries,
  normalizePrometheusBase,
  stepForRangeHours,
} from "./observability-prometheus";

describe("observability-prometheus", () => {
  it("isObservabilityPreset", () => {
    expect(isObservabilityPreset("http_p99_ms")).toBe(true);
    expect(isObservabilityPreset("evil")).toBe(false);
  });

  it("promMatrixToSeries maps first series", () => {
    expect(
      promMatrixToSeries([
        {
          values: [
            ["1000", "1.5"],
            ["1060", "2"],
          ],
        },
      ])
    ).toEqual([
      { t: 1000, v: 1.5 },
      { t: 1060, v: 2 },
    ]);
    expect(promMatrixToSeries([])).toEqual([]);
  });

  it("normalizePrometheusBase strips trailing slash", () => {
    expect(normalizePrometheusBase("http://x:9090/")).toBe("http://x:9090");
  });

  it("stepForRangeHours", () => {
    expect(stepForRangeHours(1)).toBe(15);
    expect(stepForRangeHours(6)).toBe(60);
    expect(stepForRangeHours(24)).toBe(120);
  });
});
