// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { sanitizeAgentListSearch } from "./agent-list-query";

describe("sanitizeAgentListSearch", () => {
  it("returns undefined for empty", () => {
    expect(sanitizeAgentListSearch(null)).toBeUndefined();
    expect(sanitizeAgentListSearch("")).toBeUndefined();
    expect(sanitizeAgentListSearch("  %_%  ")).toBeUndefined();
  });

  it("trims and caps length", () => {
    expect(sanitizeAgentListSearch("  hello  ")).toBe("hello");
    const long = "a".repeat(300);
    expect(sanitizeAgentListSearch(long)!.length).toBeLessThanOrEqual(200);
  });

  it("removes LIKE metacharacters", () => {
    expect(sanitizeAgentListSearch("foo%bar_baz")).toBe("foo bar baz");
  });
});
