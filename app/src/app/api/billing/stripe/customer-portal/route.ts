// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
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

/**
 * Stripe Customer Portal (payment methods, invoices) — requires linked Stripe Customer.
 */
export async function POST(req: Request) {
  return withHttpServerSpan(req, "POST /api/billing/stripe/customer-portal", async () => {
    const auth = await authorize("viewer");
    if (!auth.authorized) return auth.response;

    const userId = auth.user.id;
    if (!userId || userId === "system") {
      return NextResponse.json(
        { error: "Bad Request", message: "Portal requires a user session or API token." },
        { status: 400 }
      );
    }

    const ip = await getClientIp();
    const rl = await checkRateLimit(ip, "billing_portal");
    if (!rl.allowed) return rateLimitResponse(rl);

    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json(
        { error: "stripe_not_configured", message: "Set STRIPE_SECRET_KEY to enable the billing portal." },
        { status: 503 }
      );
    }

    const [row] = await db
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const customerId = row?.stripeCustomerId?.trim();
    if (!customerId) {
      return NextResponse.json(
        {
          error: "no_stripe_customer",
          message: "Complete a Checkout purchase first so your account is linked to Stripe.",
        },
        { status: 400 }
      );
    }

    const base = env().AUTH_URL.replace(/\/$/, "");
    const returnUrl = `${base}/settings?tab=billing`;

    try {
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      return NextResponse.json(
        { url: portal.url },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    } catch (err) {
      return NextResponse.json(
        {
          error: "stripe_error",
          message: err instanceof Error ? err.message : "Stripe Customer Portal failed.",
        },
        { status: 502 }
      );
    }
  });
}
