// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { billingLedgerEntries } from "@/db/schema";
import { authorize } from "@/lib/authorize";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-utils";
import { withHttpServerSpan } from "@/lib/otel-http-route";

/**
 * Paginated billing ledger for the current user (Stripe credits/debits + optional usage debits).
 */
export async function GET(req: Request) {
  return withHttpServerSpan(req, "GET /api/billing/ledger", async () => {
    const auth = await authorize("viewer");
    if (!auth.authorized) return auth.response;

    const userId = auth.user.id;
    if (!userId || userId === "system") {
      return NextResponse.json(
        { error: "Bad Request", message: "Ledger is only available for user sessions or API tokens." },
        { status: 400 }
      );
    }

    const ip = await getClientIp();
    const rl = await checkRateLimit(ip, "api");
    if (!rl.allowed) return rateLimitResponse(rl);

    const url = new URL(req.url);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10) || 20));
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);

    const where = eq(billingLedgerEntries.userId, userId);

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(billingLedgerEntries)
      .where(where);

    const rows = await db
      .select({
        id: billingLedgerEntries.id,
        entryType: billingLedgerEntries.entryType,
        amountMinor: billingLedgerEntries.amountMinor,
        currency: billingLedgerEntries.currency,
        createdAt: billingLedgerEntries.createdAt,
        stripeEventId: billingLedgerEntries.stripeEventId,
        stripePaymentIntentId: billingLedgerEntries.stripePaymentIntentId,
        stripeRefundId: billingLedgerEntries.stripeRefundId,
        details: billingLedgerEntries.details,
      })
      .from(billingLedgerEntries)
      .where(where)
      .orderBy(desc(billingLedgerEntries.createdAt))
      .limit(limit)
      .offset(offset);

    const total = totalRow?.count ?? 0;

    return NextResponse.json(
      {
        items: rows.map((r) => ({
          id: r.id,
          entryType: r.entryType,
          amountMinor: r.amountMinor,
          /** Signed amount for display: credits positive, debits negative. */
          signedAmountMinor:
            r.entryType === "debit_refund" || r.entryType === "usage_debit"
              ? -r.amountMinor
              : r.amountMinor,
          currency: r.currency,
          createdAt: r.createdAt.toISOString(),
          stripeEventId: r.stripeEventId,
          stripePaymentIntentId: r.stripePaymentIntentId,
          stripeRefundId: r.stripeRefundId,
          details: r.details ?? null,
        })),
        meta: { total, limit, offset },
      },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
  });
}
