// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Stripe webhook verification, idempotency (Redis), wallet updates (Postgres), and audit.
 */

import Stripe from "stripe";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { createModuleLogger } from "@/lib/logger";
import { getRedis } from "@/lib/redis";
import {
  handleCheckoutSessionCompleted,
  handleInvoicePaid,
  handlePaymentIntentSucceeded,
  handleRefundCreated,
} from "@/lib/stripe/stripe-wallet-handlers";

const log = createModuleLogger("billing.stripe");

/** Stripe may retry delivery for several days; keep idempotency key longer. */
const STRIPE_EVENT_IDEMPOTENCY_TTL_SEC = 8 * 24 * 3600;

export function verifyStripeWebhookPayload(
  rawBody: string,
  signature: string | null,
  webhookSecret: string
): Stripe.Event {
  if (!signature) {
    throw new Error("missing_stripe_signature");
  }
  return Stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

export type StripeEventClaim = "first" | "duplicate" | "redis_error";

/**
 * Redis SET NX for `stripe:webhook:event:<id>` — first delivery only.
 */
export async function tryClaimStripeEventId(eventId: string): Promise<StripeEventClaim> {
  try {
    const r = getRedis();
    const key = `stripe:webhook:event:${eventId}`;
    const res = await r.set(key, "1", "EX", STRIPE_EVENT_IDEMPOTENCY_TTL_SEC, "NX");
    if (res === "OK") return "first";
    return "duplicate";
  } catch (e) {
    log.error("stripe.webhook.redis_idempotency_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return "redis_error";
  }
}

function auditStripeWebhook(params: {
  event: Stripe.Event;
  clientIp?: string | null;
}): void {
  const { event, clientIp } = params;
  void db
    .insert(auditLogs)
    .values({
      action: "billing.stripe.webhook",
      resource: "stripe_event",
      resourceId: event.id.slice(0, 255),
      details: {
        type: event.type,
        livemode: event.livemode,
        apiVersion: event.api_version ?? null,
      },
      ipAddress: clientIp?.slice(0, 45),
    })
    .catch((err) => {
      log.error("billing.stripe.webhook audit insert failed", {
        error: err instanceof Error ? err.message : String(err),
        eventId: event.id,
      });
    });
}

/**
 * Handle a verified Stripe event (after Redis idempotency claim).
 */
export async function applyStripeWebhookEvent(
  event: Stripe.Event,
  opts?: { clientIp?: string | null }
): Promise<void> {
  auditStripeWebhook({ event, clientIp: opts?.clientIp });

  log.info("billing.stripe.webhook.processed", {
    type: event.type,
    id: event.id,
    livemode: event.livemode,
  });

  await db.transaction(async (tx) => {
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(tx, {
          eventId: event.id,
          pi: event.data.object as Stripe.PaymentIntent,
        });
        break;
      case "invoice.paid":
        await handleInvoicePaid(tx, {
          eventId: event.id,
          invoice: event.data.object as Stripe.Invoice,
        });
        break;
      case "refund.created":
        await handleRefundCreated(tx, {
          eventId: event.id,
          refund: event.data.object as Stripe.Refund,
        });
        break;
      case "charge.refunded":
        // Prefer `refund.created` for precise debits; keep no-op to avoid double-counting.
        break;
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(tx, {
          session: event.data.object as Stripe.Checkout.Session,
        });
        break;
      default:
        break;
    }
  });
}
