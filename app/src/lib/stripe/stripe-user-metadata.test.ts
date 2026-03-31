import { describe, it, expect } from "vitest";
import { parsePiloxUserIdFromMetadata } from "./stripe-user-metadata";

describe("parsePiloxUserIdFromMetadata", () => {
  it("reads pilox_user_id", () => {
    expect(
      parsePiloxUserIdFromMetadata({
        pilox_user_id: "550e8400-e29b-41d4-a716-446655440000",
      })
    ).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("reads user_id as fallback", () => {
    expect(
      parsePiloxUserIdFromMetadata({
        user_id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      })
    ).toBe("6ba7b810-9dad-11d1-80b4-00c04fd430c8");
  });

  it("returns null for invalid uuid", () => {
    expect(parsePiloxUserIdFromMetadata({ pilox_user_id: "not-a-uuid" })).toBeNull();
  });

  it("returns null when empty", () => {
    expect(parsePiloxUserIdFromMetadata(undefined)).toBeNull();
    expect(parsePiloxUserIdFromMetadata({})).toBeNull();
  });
});
