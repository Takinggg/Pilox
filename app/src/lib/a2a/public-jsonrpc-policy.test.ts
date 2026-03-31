import { describe, it, expect } from "vitest";
import {
  jsonRpcMethodFromBody,
  parsePublicA2aAllowedMethods,
} from "./public-jsonrpc-policy";

describe("parsePublicA2aAllowedMethods", () => {
  it("splits, trims, dedupes, drops invalid segments", () => {
    expect(
      parsePublicA2aAllowedMethods(" tasks/list , , tasks/list, evil\x00method ")
    ).toEqual(["tasks/list"]);
  });

  it("returns empty for blank", () => {
    expect(parsePublicA2aAllowedMethods("")).toEqual([]);
    expect(parsePublicA2aAllowedMethods("  ,  ")).toEqual([]);
  });
});

describe("jsonRpcMethodFromBody", () => {
  it("extracts method", () => {
    expect(
      jsonRpcMethodFromBody({
        jsonrpc: "2.0",
        method: "tasks/list",
        id: 1,
      })
    ).toBe("tasks/list");
  });

  it("rejects unsafe method strings", () => {
    expect(jsonRpcMethodFromBody({ method: "foo;DROP" })).toBe("");
  });
});
