import { describe, it } from "node:test";
import assert from "node:assert";
import { ed25519 } from "@noble/curves/ed25519";
import { stableStringify } from "./stable-stringify.mjs";
import { verifyRegistryRecordProof } from "./registry-proof.mjs";

describe("registry-proof", () => {
  it("accepts record without sigHex", () => {
    const r = verifyRegistryRecordProof({
      schema: "hive-registry-record-v1",
      handle: "urn:hive:nosig-abcdef",
      updatedAt: "2026-01-01T00:00:00Z",
      agentCardUrl: "https://x.example/card",
    });
    assert.strictEqual(r.ok, true);
  });

  it("verifies hive-registry-record-ed25519-v1", () => {
    const priv = ed25519.utils.randomSecretKey();
    const pub = ed25519.getPublicKey(priv);
    const pubHex = Buffer.from(pub).toString("hex");
    const payload = {
      schema: "hive-registry-record-v1",
      handle: "urn:hive:signed-rec-1",
      updatedAt: "2026-02-01T12:00:00Z",
      agentCardUrl: "https://agent.example/.well-known/agent-card.json",
    };
    const msg = new TextEncoder().encode(stableStringify(payload));
    const sig = ed25519.sign(msg, priv);
    const sigHex = Buffer.from(sig).toString("hex");
    const rec = {
      ...payload,
      publicKeys: {
        ed25519: [{ kid: "k1", publicKeyHex: pubHex }],
      },
      proof: {
        type: "hive-registry-record-ed25519-v1",
        signingKid: "k1",
        signer: "https://registrar.example",
        sigHex,
      },
    };
    const r = verifyRegistryRecordProof(rec);
    assert.strictEqual(r.ok, true);
  });

  it("rejects tampered agentCardUrl", () => {
    const priv = ed25519.utils.randomSecretKey();
    const pub = ed25519.getPublicKey(priv);
    const pubHex = Buffer.from(pub).toString("hex");
    const payload = {
      schema: "hive-registry-record-v1",
      handle: "urn:hive:tamper-abcdef",
      updatedAt: "2026-02-01T12:00:00Z",
      agentCardUrl: "https://good.example/card",
    };
    const msg = new TextEncoder().encode(stableStringify(payload));
    const sig = ed25519.sign(msg, priv);
    const sigHex = Buffer.from(sig).toString("hex");
    const rec = {
      ...payload,
      agentCardUrl: "https://evil.example/card",
      publicKeys: {
        ed25519: [{ kid: "k1", publicKeyHex: pubHex }],
      },
      proof: {
        type: "hive-registry-record-ed25519-v1",
        signingKid: "k1",
        sigHex,
      },
    };
    const r = verifyRegistryRecordProof(rec);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, "bad_signature");
  });
});
