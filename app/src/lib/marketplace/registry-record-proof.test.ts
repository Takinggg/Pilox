// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { ed25519 } from "@noble/curves/ed25519";
import { describe, expect, it } from "vitest";
import { stableStringify } from "@/lib/mesh-envelope";
import { verifyRegistryRecordProof } from "./registry-record-proof";

describe("verifyRegistryRecordProof", () => {
  it("accepts record without sigHex", () => {
    const r = verifyRegistryRecordProof({
      schema: "pilox-registry-record-v1",
      handle: "urn:pilox:nosig-abcdef",
      updatedAt: "2026-01-01T00:00:00Z",
      agentCardUrl: "https://x.example/card",
    });
    expect(r.ok).toBe(true);
  });

  it("verifies pilox-registry-record-ed25519-v1", () => {
    const priv = ed25519.utils.randomSecretKey();
    const pub = ed25519.getPublicKey(priv);
    const pubHex = Buffer.from(pub).toString("hex");
    const payload = {
      schema: "pilox-registry-record-v1",
      handle: "urn:pilox:signed-rec-1",
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
        type: "pilox-registry-record-ed25519-v1",
        signingKid: "k1",
        signer: "https://registrar.example",
        sigHex,
      },
    };
    expect(verifyRegistryRecordProof(rec).ok).toBe(true);
  });

  it("rejects tampered agentCardUrl", () => {
    const priv = ed25519.utils.randomSecretKey();
    const pub = ed25519.getPublicKey(priv);
    const pubHex = Buffer.from(pub).toString("hex");
    const payload = {
      schema: "pilox-registry-record-v1",
      handle: "urn:pilox:tamper-abcdef",
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
        type: "pilox-registry-record-ed25519-v1",
        signingKid: "k1",
        sigHex,
      },
    };
    const r = verifyRegistryRecordProof(rec);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_signature");
  });
});
