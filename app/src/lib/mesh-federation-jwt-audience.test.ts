import { describe, it, expect } from "vitest";
import { federationJwtExpectedAudience } from "./mesh-federation-jwt-audience";

describe("federationJwtExpectedAudience", () => {
  it("uses AUTH_URL origin when JWT audience env is empty", () => {
    expect(
      federationJwtExpectedAudience({
        AUTH_URL: "https://app.example/path",
        MESH_FEDERATION_JWT_AUDIENCE: "",
      })
    ).toBe("https://app.example");
  });

  it("prefers MESH_FEDERATION_JWT_AUDIENCE when set", () => {
    expect(
      federationJwtExpectedAudience({
        AUTH_URL: "https://internal:3000",
        MESH_FEDERATION_JWT_AUDIENCE: "https://edge.example",
      })
    ).toBe("https://edge.example");
  });
});
