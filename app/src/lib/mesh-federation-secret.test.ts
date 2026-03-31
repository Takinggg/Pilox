import { describe, it, expect } from "vitest";
import {
  federationSharedSecretReady,
  isWeakFederationSharedSecret,
} from "./mesh-federation-secret";

describe("mesh-federation-secret", () => {
  it("federationSharedSecretReady", () => {
    expect(federationSharedSecretReady(undefined)).toBe(false);
    expect(federationSharedSecretReady("x".repeat(31))).toBe(false);
    expect(federationSharedSecretReady("x".repeat(32))).toBe(true);
  });

  it("isWeakFederationSharedSecret flags trivial patterns", () => {
    expect(isWeakFederationSharedSecret("a".repeat(32))).toBe(true);
    expect(isWeakFederationSharedSecret("abababababababababababababababab")).toBe(true);
    expect(isWeakFederationSharedSecret("abcdabcdabcdabcdabcdabcdabcdabcd")).toBe(true);
    expect(
      isWeakFederationSharedSecret(
        "kL9mN2pQ5rS8tU1vW4xY7zA0bC3dE6fG9hJ2nM5pQ8rT1uV4wX7yZ0aB3cD6eF9gH2jK5"
      )
    ).toBe(false);
  });
});
