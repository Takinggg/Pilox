// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { sql, eq } from "drizzle-orm";
import { db } from "@/db";
import { userWalletBalances } from "@/db/schema";

export type BillingDbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Upsert wallet balance delta (positive = credit, negative = debit).
 */
export async function bumpWallet(
  tx: BillingDbTx,
  params: { userId: string; deltaMinor: number; currency: string }
): Promise<void> {
  const { userId, deltaMinor, currency } = params;
  await tx
    .insert(userWalletBalances)
    .values({
      userId,
      balanceMinor: deltaMinor,
      currency,
    })
    .onConflictDoUpdate({
      target: userWalletBalances.userId,
      set: {
        balanceMinor: sql`${userWalletBalances.balanceMinor} + ${deltaMinor}`,
        updatedAt: new Date(),
      },
    });
}

export async function getWalletBalanceMinor(
  tx: BillingDbTx,
  userId: string
): Promise<number> {
  const row = await tx
    .select({ balanceMinor: userWalletBalances.balanceMinor })
    .from(userWalletBalances)
    .where(eq(userWalletBalances.userId, userId))
    .limit(1);
  return row[0]?.balanceMinor ?? 0;
}

export async function getWalletCurrency(
  tx: BillingDbTx,
  userId: string
): Promise<string> {
  const row = await tx
    .select({ currency: userWalletBalances.currency })
    .from(userWalletBalances)
    .where(eq(userWalletBalances.userId, userId))
    .limit(1);
  return row[0]?.currency ?? "usd";
}
