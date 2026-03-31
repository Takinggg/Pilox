import { describe, it, expect } from "vitest";
import { a2aCallerLogFields } from "./a2a-log-privacy";

describe("a2aCallerLogFields", () => {
  it("tags service labels", () => {
    expect(a2aCallerLogFields("pilox-internal")).toEqual({
      callerKind: "service",
      callerRef: "pilox-internal",
    });
  });

  it("passes UUID through", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(a2aCallerLogFields(id)).toEqual({
      callerKind: "user_uuid",
      callerRef: id,
    });
  });

  it("hashes email", () => {
    const f = a2aCallerLogFields("User@Example.COM");
    expect(f.callerKind).toBe("email_hash");
    expect(f.callerRef).toHaveLength(12);
    expect(f.callerRef).toMatch(/^[0-9a-f]+$/);
  });
});
