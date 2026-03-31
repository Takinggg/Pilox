import { describe, it, expect } from "vitest";
import { buildA2ACryptoFromEnv } from "./key-material";

const ZEROS = "0".repeat(64);

describe("buildA2ACryptoFromEnv", () => {
  it("returns empty when secrets omitted", () => {
    const c = buildA2ACryptoFromEnv({});
    expect(c.signing).toBeUndefined();
    expect(c.noise).toBeUndefined();
  });

  it("derives signing and noise key pairs from 32-byte hex seeds", () => {
    const c = buildA2ACryptoFromEnv({
      signingSecretHex: ZEROS,
      noiseStaticSecretHex: ZEROS,
    });
    expect(c.signing?.keyPair).toBeDefined();
    expect(c.noise?.staticKeyPair).toBeDefined();
    expect(c.signing!.keyPair!.secretKey.length).toBe(32);
    expect(c.signing!.keyPair!.publicKey.length).toBe(32);
    expect(c.noise!.staticKeyPair!.secretKey.length).toBe(32);
    expect(c.noise!.staticKeyPair!.publicKey.length).toBe(32);
  });

  it("rejects invalid hex length", () => {
    expect(() =>
      buildA2ACryptoFromEnv({ signingSecretHex: "ab" })
    ).toThrow(/64 hex/);
  });
});
