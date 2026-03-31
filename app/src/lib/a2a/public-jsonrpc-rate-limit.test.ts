import { describe, expect, it } from "vitest";
import { hashPublicIdentityValue } from "./public-jsonrpc-rate-limit";

describe("public-jsonrpc-rate-limit identity", () => {
  it("hashPublicIdentityValue is stable", () => {
    expect(hashPublicIdentityValue("client-a")).toBe(
      hashPublicIdentityValue("client-a")
    );
    expect(hashPublicIdentityValue("client-a")).not.toBe(
      hashPublicIdentityValue("client-b")
    );
  });
});
