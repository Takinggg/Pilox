import { describe, it, expect, vi, beforeEach } from "vitest";
import Stripe from "stripe";

const TEST_WHSEC = "whsec_test_12345678901234567890123456789012";

const redisSet = vi.fn().mockResolvedValue("OK");

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({ set: (...args: unknown[]) => redisSet(...args) }),
}));

vi.mock("@/lib/stripe/stripe-wallet-handlers", () => ({
  handlePaymentIntentSucceeded: vi.fn().mockResolvedValue(undefined),
  handleRefundCreated: vi.fn().mockResolvedValue(undefined),
  handleCheckoutSessionCompleted: vi.fn().mockResolvedValue(undefined),
  handleInvoicePaid: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/db", () => ({
  db: {
    insert: () => ({
      values: () => ({
        catch: () => Promise.resolve(),
      }),
    }),
    transaction: async (fn: (tx: unknown) => Promise<void>) => {
      await fn({});
    },
  },
}));

vi.mock("@/db/schema", () => ({
  auditLogs: {},
}));

import {
  applyStripeWebhookEvent,
  tryClaimStripeEventId,
  verifyStripeWebhookPayload,
} from "./process-stripe-webhook";

describe("verifyStripeWebhookPayload", () => {
  it("constructs event from signed payload", () => {
    const payload = JSON.stringify({
      id: "evt_test_signed",
      object: "event",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_test" } },
    });
    const header = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: TEST_WHSEC,
    });
    const event = verifyStripeWebhookPayload(payload, header, TEST_WHSEC);
    expect(event.id).toBe("evt_test_signed");
    expect(event.type).toBe("payment_intent.succeeded");
  });

  it("throws when signature header is missing", () => {
    expect(() => verifyStripeWebhookPayload('{"id":"evt_x"}', null, TEST_WHSEC)).toThrow(
      "missing_stripe_signature"
    );
  });

  it("throws when signature is invalid", () => {
    expect(() => verifyStripeWebhookPayload('{"id":"evt_x"}', "bad_sig", TEST_WHSEC)).toThrow();
  });
});

describe("tryClaimStripeEventId", () => {
  beforeEach(() => {
    redisSet.mockResolvedValue("OK");
  });

  it("returns first when SET NX succeeds", async () => {
    const r = await tryClaimStripeEventId("evt_abc");
    expect(r).toBe("first");
    expect(redisSet).toHaveBeenCalledWith(
      "stripe:webhook:event:evt_abc",
      "1",
      "EX",
      expect.any(Number),
      "NX"
    );
  });

  it("returns duplicate when key already exists", async () => {
    redisSet.mockResolvedValueOnce(null);
    const r = await tryClaimStripeEventId("evt_dup");
    expect(r).toBe("duplicate");
  });
});

describe("applyStripeWebhookEvent", () => {
  it("resolves for a minimal event object", async () => {
    const event = {
      id: "evt_1",
      object: "event",
      type: "payment_intent.succeeded",
      livemode: false,
      api_version: "2024-11-20.acacia",
      data: { object: {} },
    } as unknown as Stripe.Event;

    await expect(applyStripeWebhookEvent(event, { clientIp: "203.0.113.1" })).resolves.toBeUndefined();
  });
});
