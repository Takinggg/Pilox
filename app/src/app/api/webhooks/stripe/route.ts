// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { env } from "@/lib/env";
import { createModuleLogger } from "@/lib/logger";
import { getClientIp } from "@/lib/request-utils";
import {
  applyStripeWebhookEvent,
  tryClaimStripeEventId,
  verifyStripeWebhookPayload,
} from "@/lib/stripe/process-stripe-webhook";
import { withHttpServerSpan } from "@/lib/otel-http-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createModuleLogger("billing.stripe");

/**
 * Stripe webhook endpoint — configure Dashboard → Webhooks → URL `https://<host>/api/webhooks/stripe`.
 * Requires `STRIPE_WEBHOOK_SECRET` (signing secret `whsec_…`).
 */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/webhooks/stripe", async () => {
    const e = env();
    const webhookSecret = e.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json(
        { error: "stripe_webhooks_not_configured", message: "Set STRIPE_WEBHOOK_SECRET to enable." },
        { status: 503 }
      );
    }

    const signature = req.headers.get("stripe-signature");
    const rawBody = await req.text();

    let event: Stripe.Event;
    try {
      event = verifyStripeWebhookPayload(rawBody, signature, webhookSecret);
    } catch (err) {
      log.warn("billing.stripe.webhook.verify_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: "invalid_signature", message: "Stripe signature verification failed." },
        { status: 400 }
      );
    }

    const claim = await tryClaimStripeEventId(event.id);
    if (claim === "redis_error") {
      return NextResponse.json(
        { error: "idempotency_unavailable", message: "Redis unavailable; retry later." },
        { status: 503 }
      );
    }
    if (claim === "duplicate") {
      log.debug("billing.stripe.webhook.redis_duplicate_hint", { id: event.id, type: event.type });
    }

    const ip = await getClientIp();

    /** Always run apply: ledger is idempotent on `stripe_event_id` (retries after partial failure). */
    await applyStripeWebhookEvent(event, { clientIp: ip });

    return NextResponse.json({ received: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
  });
}
