import { describe, it } from "node:test";
import assert from "node:assert";
import crypto from "node:crypto";
import { stableStringify } from "./stable-stringify.mjs";
import { verifyPublishAttestationHmac } from "./registry-publish-hmac.mjs";

describe("verifyPublishAttestationHmac", () => {
  it("accepts valid HMAC", () => {
    const secret = "test-secret-at-least-32-bytes-long!!";
    const record = {
      handle: "urn:test:hmac:agent:01",
      updatedAt: "2026-03-20T12:00:00Z",
      buyerInputs: [{ id: "a", label: "K", kind: "env", key: "K" }],
      publishAttestation: {
        confirmedAt: "2026-03-20T12:00:00Z",
        confirmedBuyerConfiguration: true,
      },
    };
    const payload = stableStringify({
      handle: record.handle,
      updatedAt: record.updatedAt,
      buyerInputs: record.buyerInputs,
    });
    const mac = crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
    record.publishAttestation.hmacSha256Hex = mac;
    const vr = verifyPublishAttestationHmac(record, secret);
    assert.strictEqual(vr.ok, true);
  });

  it("rejects tampered buyerInputs", () => {
    const secret = "test-secret-at-least-32-bytes-long!!";
    const record = {
      handle: "urn:test:hmac:agent:02",
      updatedAt: "2026-03-20T12:00:00Z",
      buyerInputs: [],
      publishAttestation: {
        confirmedAt: "2026-03-20T12:00:00Z",
        confirmedBuyerConfiguration: true,
      },
    };
    const payload = stableStringify({
      handle: record.handle,
      updatedAt: record.updatedAt,
      buyerInputs: record.buyerInputs,
    });
    record.publishAttestation.hmacSha256Hex = crypto
      .createHmac("sha256", secret)
      .update(payload, "utf8")
      .digest("hex");
    record.buyerInputs = [{ id: "x", label: "X", kind: "text" }];
    const vr = verifyPublishAttestationHmac(record, secret);
    assert.strictEqual(vr.ok, false);
  });
});
