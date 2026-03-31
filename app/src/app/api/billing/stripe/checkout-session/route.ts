// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { env } from "@/lib/env";
import { getStripe } from "@/lib/stripe/stripe-client";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-utils";
import { withHttpServerSpan } from "@/lib/otel-http-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    mode: z.enum(["payment", "subscription"]).optional().default("payment"),
    amountMinor: z.number().int().min(100).max(100_000_000).optional(),
    currency: z.string().length(3).optional(),
    /** Overrides `STRIPE_SUBSCRIPTION_PRICE_ID` for `mode: subscription`. */
    priceId: z.string().min(1).optional(),
  })
  .refine((d) => d.mode !== "payment" || d.amountMinor != null, {
    message: "amountMinor is required when mode is payment",
  });

/**
 * Create a Stripe Checkout Session — one-time wallet top-up (`payment`) or recurring (`subscription`).
 */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/billing/stripe/checkout-session", async () => {
    const auth = await authorize("viewer");
    if (!auth.authorized) return auth.response;

    const userId = auth.user.id;
    if (!userId || userId === "system") {
      return NextResponse.json(
        { error: "Bad Request", message: "Checkout requires a user session or API token." },
        { status: 400 }
      );
    }

    const ip = await getClientIp();
    const rl = await checkRateLimit(ip, "billing_checkout");
    if (!rl.allowed) return rateLimitResponse(rl);

    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json(
        { error: "stripe_not_configured", message: "Set STRIPE_SECRET_KEY to enable Checkout." },
        { status: 503 }
      );
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Bad Request", message: "Invalid JSON body." }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.flatten().formErrors.join("; ") || parsed.error.message;
      return NextResponse.json({ error: "Bad Request", message: msg }, { status: 400 });
    }

    const { mode, amountMinor, priceId } = parsed.data;
    const currency = (parsed.data.currency ?? "usd").toLowerCase();
    const e = env();
    const base = e.AUTH_URL.replace(/\/$/, "");
    const successUrl = `${base}/settings?tab=billing&checkout=success`;
    const cancelUrl = `${base}/settings?tab=billing&checkout=cancel`;

    const [userRow] = await db
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const meta = { pilox_user_id: userId };

    let params: Stripe.Checkout.SessionCreateParams;

    if (mode === "subscription") {
      const price =
        priceId?.trim() ?? e.STRIPE_SUBSCRIPTION_PRICE_ID?.trim();
      if (!price) {
        return NextResponse.json(
          {
            error: "stripe_subscription_price_required",
            message:
              "Set STRIPE_SUBSCRIPTION_PRICE_ID or pass priceId for subscription Checkout.",
          },
          { status: 503 }
        );
      }
      params = {
        mode: "subscription",
        line_items: [{ price, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: meta,
        client_reference_id: userId,
        subscription_data: {
          metadata: meta,
        },
      };
    } else {
      params = {
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency,
              unit_amount: amountMinor!,
              product_data: {
                name: "Pilox wallet credit",
                description: "Credits your Pilox account balance after payment succeeds.",
              },
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: meta,
        client_reference_id: userId,
        payment_intent_data: {
          metadata: meta,
        },
      };
    }

    if (userRow?.stripeCustomerId) {
      params.customer = userRow.stripeCustomerId;
    } else {
      params.customer_creation = "always";
    }

    try {
      const session = await stripe.checkout.sessions.create(params);
      if (!session.url) {
        return NextResponse.json(
          { error: "stripe_error", message: "Checkout session missing redirect URL." },
          { status: 502 }
        );
      }
      return NextResponse.json(
        { url: session.url, sessionId: session.id, mode },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    } catch (err) {
      return NextResponse.json(
        {
          error: "stripe_error",
          message: err instanceof Error ? err.message : "Stripe Checkout failed.",
        },
        { status: 502 }
      );
    }
  });
}
