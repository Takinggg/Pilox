import { describe, it, expect } from "vitest";
import {
  recordMeshPublicA2aTierDecision,
  recordMeshPublicReputationRedisSuccess,
} from "./mesh-otel";

describe("mesh-otel", () => {
  it("recordMeshPublicA2aTierDecision does not throw (noop meter if no global provider)", () => {
    expect(() =>
      recordMeshPublicA2aTierDecision("parse_rejected")
    ).not.toThrow();
  });

  it("recordMeshPublicReputationRedisSuccess does not throw", () => {
    expect(() => recordMeshPublicReputationRedisSuccess("ok")).not.toThrow();
  });

  it("recordMeshPublicA2aTierDecision accepts reputation_blocked", () => {
    expect(() =>
      recordMeshPublicA2aTierDecision("reputation_blocked")
    ).not.toThrow();
  });
});
