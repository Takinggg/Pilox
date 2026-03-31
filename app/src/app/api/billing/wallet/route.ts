// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userWalletBalances, users } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { getBillingUsageMinorPer1kTokens } from "@/lib/billing/inference-usage-billing";
import { env } from "@/lib/env";
import { withHttpServerSpan } from "@/lib/otel-http-route";

/**
 * Current user's wallet balance (minor units, e.g. cents) — populated by Stripe webhooks.
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/billing/wallet", async () => {
    const auth = await authorize("viewer");
    if (!auth.authorized) return auth.response;

    const userId = auth.user.id;
    if (!userId || userId === "system") {
      return NextResponse.json(
        { error: "Bad Request", message: "Wallet is only available for user sessions or API tokens." },
        { status: 400 }
      );
    }

    const [combined] = await db
      .select({
        balanceMinor: userWalletBalances.balanceMinor,
        currency: userWalletBalances.currency,
        updatedAt: userWalletBalances.updatedAt,
        stripeCustomerId: users.stripeCustomerId,
      })
      .from(users)
      .leftJoin(userWalletBalances, eq(userWalletBalances.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);

    const e = env();
    const checkoutEnabled = !!e.STRIPE_SECRET_KEY?.trim();
    const customerPortalEnabled = checkoutEnabled && !!combined?.stripeCustomerId?.trim();
    const subscriptionCheckoutEnabled =
      checkoutEnabled && !!e.STRIPE_SUBSCRIPTION_PRICE_ID?.trim();

    const billingUsageMinorPer1kTokens = getBillingUsageMinorPer1kTokens();

    return NextResponse.json(
      {
        balanceMinor: combined?.balanceMinor ?? 0,
        currency: combined?.currency ?? "usd",
        updatedAt: combined?.updatedAt?.toISOString() ?? null,
        /** When > 0, inference token sync debits this many minor units per 1,000 total tokens. */
        billingUsageMinorPer1kTokens,
        stripe: {
          checkoutEnabled,
          customerPortalEnabled,
          subscriptionCheckoutEnabled,
        },
      },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
  });
}
