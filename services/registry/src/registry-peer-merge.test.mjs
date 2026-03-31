import { describe, it } from "node:test";
import assert from "node:assert";
import { ed25519 } from "@noble/curves/ed25519";
import { stableStringify } from "./stable-stringify.mjs";
import { acceptPeerRecord } from "./registry-peer-merge.mjs";

describe("acceptPeerRecord", () => {
  const base = {
    schema: "hive-registry-record-v1",
    handle: "urn:hive:peer-merge-abcdef",
    updatedAt: "2026-03-01T00:00:00Z",
    agentCardUrl: "https://x.example/card",
  };

  it("accepts newer when no existing", () => {
    const r = acceptPeerRecord(undefined, base, { syncVerifyProof: false });
    assert.deepStrictEqual(r, { ok: true });
  });

  it("rejects not_newer", () => {
    const existing = { ...base, updatedAt: "2026-03-02T00:00:00Z" };
    const remote = { ...base, updatedAt: "2026-03-01T12:00:00Z" };
    const r = acceptPeerRecord(existing, remote, { syncVerifyProof: false });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, "not_newer");
  });

  it("with syncVerifyProof rejects tampered payload", () => {
    const priv = ed25519.utils.randomSecretKey();
    const pub = ed25519.getPublicKey(priv);
    const pubHex = Buffer.from(pub).toString("hex");
    const payload = {
      schema: "hive-registry-record-v1",
      handle: "urn:hive:peer-merge-signed",
      updatedAt: "2026-03-10T00:00:00Z",
      agentCardUrl: "https://good.example/card",
    };
    const msg = new TextEncoder().encode(stableStringify(payload));
    const sig = ed25519.sign(msg, priv);
    const rec = {
      ...payload,
      agentCardUrl: "https://evil.example/card",
      publicKeys: {
        ed25519: [{ kid: "k1", publicKeyHex: pubHex }],
      },
      proof: {
        type: "hive-registry-record-ed25519-v1",
        signingKid: "k1",
        sigHex: Buffer.from(sig).toString("hex"),
      },
    };
    const r = acceptPeerRecord(undefined, rec, { syncVerifyProof: true });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, "bad_signature");
  });
});
