import { describe, it } from "node:test";
import assert from "node:assert";
import { evaluatePublishReadiness } from "./registry-publish-readiness.mjs";

describe("evaluatePublishReadiness", () => {
  it("requires attestation when requireAttestation", async () => {
    const r = await evaluatePublishReadiness(
      {
        handle: "urn:test:pub:01",
        agentCardUrl: "https://example.com/c",
        buyerInputs: [
          {
            id: "a",
            label: "Key",
            kind: "env",
            key: "K",
            description: "desc long enough",
          },
        ],
      },
      {
        requireAttestation: true,
        fetchAgentCard: false,
        agentCardTimeoutMs: 1000,
        manifestUrlTimeoutMs: 1000,
      }
    );
    assert.strictEqual(r.ok, false);
    assert.ok(r.issues.some((i) => i.code === "publish_attestation_required"));
  });

  it("passes with attestation and documented env", async () => {
    const r = await evaluatePublishReadiness(
      {
        handle: "urn:test:pub:02",
        agentCardUrl: "https://example.com/c",
        publishAttestation: {
          confirmedAt: "2026-03-20T12:00:00Z",
          confirmedBuyerConfiguration: true,
        },
        buyerInputs: [
          {
            id: "a",
            label: "Key",
            kind: "env",
            key: "K",
            required: true,
            description: "Provide your API key for the service.",
          },
        ],
      },
      {
        requireAttestation: true,
        fetchAgentCard: false,
        agentCardTimeoutMs: 1000,
        manifestUrlTimeoutMs: 1000,
      }
    );
    assert.strictEqual(r.ok, true);
  });

  it("flags missing description for required buyer input", async () => {
    const r = await evaluatePublishReadiness(
      {
        handle: "urn:test:pub:03",
        agentCardUrl: "https://example.com/c",
        buyerInputs: [
          {
            id: "a",
            label: "Key",
            kind: "env",
            key: "K",
            required: true,
            description: "short",
          },
        ],
      },
      {
        requireAttestation: false,
        fetchAgentCard: false,
        agentCardTimeoutMs: 1000,
        manifestUrlTimeoutMs: 1000,
      }
    );
    assert.strictEqual(r.ok, false);
    assert.ok(r.issues.some((i) => i.code === "buyer_input_required_needs_description"));
  });
});
