// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { billingLedgerEntries, users } from "@/db/schema";
import { createModuleLogger } from "@/lib/logger";
import { parsePiloxUserIdFromMetadata } from "@/lib/stripe/stripe-user-metadata";
import { bumpWallet, type BillingDbTx } from "@/lib/billing/wallet-bump";

const log = createModuleLogger("billing.stripe.wallet");

type DbTx = BillingDbTx;

async function resolveUserIdFromPaymentIntent(
  tx: DbTx,
  pi: Stripe.PaymentIntent
): Promise<string | null> {
  const fromMeta = parsePiloxUserIdFromMetadata(
    pi.metadata as Record<string, string> | null | undefined
  );
  if (fromMeta) return fromMeta;

  const cust = pi.customer;
  if (typeof cust === "string" && cust.length > 0) {
    const row = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.stripeCustomerId, cust))
      .limit(1);
    return row[0]?.id ?? null;
  }
  return null;
}

async function resolveUserIdFromStripeCustomerId(
  tx: DbTx,
  customerId: string | null | undefined
): Promise<string | null> {
  if (!customerId || typeof customerId !== "string") return null;
  const row = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);
  return row[0]?.id ?? null;
}

async function resolveUserIdFromRefund(tx: DbTx, refund: Stripe.Refund): Promise<string | null> {
  const fromMeta = parsePiloxUserIdFromMetadata(
    refund.metadata as Record<string, string> | null | undefined
  );
  if (fromMeta) return fromMeta;

  const piId = refund.payment_intent;
  if (typeof piId === "string" && piId.length > 0) {
    const row = await tx
      .select({ userId: billingLedgerEntries.userId })
      .from(billingLedgerEntries)
      .where(eq(billingLedgerEntries.stripePaymentIntentId, piId))
      .limit(1);
    if (row[0]?.userId) return row[0].userId;
  }

  return null;
}

/**
 * Credit wallet after successful PaymentIntent (one ledger row per Stripe event id).
 */
export async function handlePaymentIntentSucceeded(
  tx: DbTx,
  params: { eventId: string; pi: Stripe.PaymentIntent }
): Promise<void> {
  const { eventId, pi } = params;

  /** Subscription / invoiced charges: credit via `invoice.paid` only (avoids double credit). */
  if (pi.invoice) {
    log.debug("billing.stripe.wallet.pi_skipped_has_invoice", {
      paymentIntentId: pi.id,
      eventId,
    });
    return;
  }

  const userId = await resolveUserIdFromPaymentIntent(tx, pi);
  if (!userId) {
    log.warn("billing.stripe.wallet.pi_no_user", {
      paymentIntentId: pi.id,
      eventId,
      hasCustomer: !!pi.customer,
    });
    return;
  }

  const amount = pi.amount_received ?? pi.amount;
  if (amount <= 0) {
    log.warn("billing.stripe.wallet.pi_zero_amount", { paymentIntentId: pi.id, eventId });
    return;
  }

  const currency = (pi.currency || "usd").toLowerCase();

  const [inserted] = await tx
    .insert(billingLedgerEntries)
    .values({
      userId,
      stripeEventId: eventId,
      stripePaymentIntentId: pi.id,
      entryType: "credit",
      amountMinor: amount,
      currency,
      details: {
        paymentIntentStatus: pi.status,
        customer: typeof pi.customer === "string" ? pi.customer : null,
      },
    })
    .onConflictDoNothing({ target: billingLedgerEntries.stripeEventId })
    .returning({ id: billingLedgerEntries.id });

  if (!inserted) {
    log.debug("billing.stripe.wallet.pi_duplicate_ledger", { eventId, paymentIntentId: pi.id });
    return;
  }

  await bumpWallet(tx, { userId, deltaMinor: amount, currency });

  log.info("billing.stripe.wallet.credited", {
    userId,
    paymentIntentId: pi.id,
    amountMinor: amount,
    currency,
    eventId,
  });
}

/**
 * Credit wallet when an invoice is paid (subscriptions and other invoiced flows).
 */
export async function handleInvoicePaid(
  tx: DbTx,
  params: { eventId: string; invoice: Stripe.Invoice }
): Promise<void> {
  const { eventId, invoice } = params;

  if (invoice.status !== "paid") {
    log.debug("billing.stripe.wallet.invoice_not_paid", { invoiceId: invoice.id, status: invoice.status });
    return;
  }

  const amount = invoice.amount_paid;
  if (amount <= 0) {
    log.debug("billing.stripe.wallet.invoice_zero_amount", { invoiceId: invoice.id, eventId });
    return;
  }

  const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
  const userId = await resolveUserIdFromStripeCustomerId(tx, customerId);
  if (!userId) {
    log.warn("billing.stripe.wallet.invoice_no_user", {
      invoiceId: invoice.id,
      eventId,
      customer: customerId,
    });
    return;
  }

  const currency = (invoice.currency || "usd").toLowerCase();
  const piId =
    typeof invoice.payment_intent === "string"
      ? invoice.payment_intent
      : invoice.payment_intent && typeof invoice.payment_intent === "object"
        ? invoice.payment_intent.id
        : undefined;

  const [inserted] = await tx
    .insert(billingLedgerEntries)
    .values({
      userId,
      stripeEventId: eventId,
      stripePaymentIntentId: piId,
      entryType: "credit",
      amountMinor: amount,
      currency,
      details: {
        invoiceId: invoice.id,
        subscription:
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription && typeof invoice.subscription === "object"
              ? invoice.subscription.id
              : null,
        billingReason: invoice.billing_reason ?? null,
      },
    })
    .onConflictDoNothing({ target: billingLedgerEntries.stripeEventId })
    .returning({ id: billingLedgerEntries.id });

  if (!inserted) {
    log.debug("billing.stripe.wallet.invoice_duplicate_ledger", { eventId, invoiceId: invoice.id });
    return;
  }

  await bumpWallet(tx, { userId, deltaMinor: amount, currency });

  log.info("billing.stripe.wallet.credited_invoice", {
    userId,
    invoiceId: invoice.id,
    amountMinor: amount,
    currency,
    eventId,
  });
}

/**
 * Debit wallet after Refund (one ledger row per refund event id).
 */
export async function handleRefundCreated(
  tx: DbTx,
  params: { eventId: string; refund: Stripe.Refund }
): Promise<void> {
  const { eventId, refund } = params;
  const userId = await resolveUserIdFromRefund(tx, refund);
  if (!userId) {
    log.warn("billing.stripe.wallet.refund_no_user", {
      refundId: refund.id,
      eventId,
      paymentIntent: refund.payment_intent,
    });
    return;
  }

  const amount = refund.amount;
  if (amount <= 0) {
    log.warn("billing.stripe.wallet.refund_zero_amount", { refundId: refund.id, eventId });
    return;
  }

  const currency = (refund.currency || "usd").toLowerCase();
  const piId = typeof refund.payment_intent === "string" ? refund.payment_intent : null;

  const [inserted] = await tx
    .insert(billingLedgerEntries)
    .values({
      userId,
      stripeEventId: eventId,
      stripePaymentIntentId: piId ?? undefined,
      stripeRefundId: refund.id,
      entryType: "debit_refund",
      amountMinor: amount,
      currency,
      details: {
        charge: typeof refund.charge === "string" ? refund.charge : null,
        status: refund.status,
      },
    })
    .onConflictDoNothing({ target: billingLedgerEntries.stripeEventId })
    .returning({ id: billingLedgerEntries.id });

  if (!inserted) {
    log.debug("billing.stripe.wallet.refund_duplicate_ledger", { eventId, refundId: refund.id });
    return;
  }

  await bumpWallet(tx, { userId, deltaMinor: -amount, currency });

  log.info("billing.stripe.wallet.debited_refund", {
    userId,
    refundId: refund.id,
    amountMinor: amount,
    currency,
    eventId,
  });
}

/**
 * Link Stripe Customer to Pilox user after Checkout (metadata must include `pilox_user_id`).
 */
export async function handleCheckoutSessionCompleted(
  tx: DbTx,
  params: { session: Stripe.Checkout.Session }
): Promise<void> {
  const { session } = params;
  const customer = typeof session.customer === "string" && session.customer.length > 0 ? session.customer : null;
  const userId = parsePiloxUserIdFromMetadata(
    session.metadata as Record<string, string> | null | undefined
  );

  if (!customer || !userId) {
    log.warn("billing.stripe.checkout.session_incomplete", {
      hasCustomer: !!customer,
      hasUserId: !!userId,
      sessionId: session.id,
    });
    return;
  }

  const [row] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) {
    log.warn("billing.stripe.checkout.user_not_found", { userId, sessionId: session.id });
    return;
  }

  if (row.stripeCustomerId && row.stripeCustomerId !== customer) {
    log.warn("billing.stripe.checkout.customer_mismatch", {
      userId,
      existing: row.stripeCustomerId,
      incoming: customer,
    });
    return;
  }

  const [other] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.stripeCustomerId, customer))
    .limit(1);
  if (other && other.id !== userId) {
    log.warn("billing.stripe.checkout.customer_owned_by_other", {
      customer,
      otherUserId: other.id,
    });
    return;
  }

  if (row.stripeCustomerId === customer) {
    log.debug("billing.stripe.checkout.customer_already_linked", { userId, customer });
    return;
  }

  await tx
    .update(users)
    .set({ stripeCustomerId: customer, updatedAt: new Date() })
    .where(eq(users.id, userId));

  log.info("billing.stripe.checkout.customer_linked", {
    userId,
    customer,
    sessionId: session.id,
  });
}
