// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { billingLedgerEntries } from "@/db/schema";
import { createModuleLogger } from "@/lib/logger";
import type { BillingDbTx } from "@/lib/billing/wallet-bump";
import { bumpWallet, getWalletBalanceMinor, getWalletCurrency } from "@/lib/billing/wallet-bump";

const log = createModuleLogger("billing.usage");

/**
 * Minor currency units charged per 1,000 total tokens (input + output).
 * Set `BILLING_USAGE_MINOR_PER_1K_TOKENS` (e.g. `5` = $0.05 per 1k tokens in USD cents).
 * When unset or 0, no usage debits are applied.
 */
export function getBillingUsageMinorPer1kTokens(): number {
  const raw = process.env.BILLING_USAGE_MINOR_PER_1K_TOKENS;
  if (raw === undefined || raw === "") return 0;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * Rounds up: total tokens × rate / 1000.
 */
export function computeUsageChargeMinor(
  tokensIn: number,
  tokensOut: number,
  minorPer1k: number
): number {
  if (minorPer1k <= 0) return 0;
  const total = Math.max(0, tokensIn) + Math.max(0, tokensOut);
  if (total <= 0) return 0;
  return Math.ceil((total * minorPer1k) / 1000);
}

const USAGE_LEDGER_PREFIX = "pilox_usage:";

/**
 * Debit wallet for synced inference usage. Idempotent per `inferenceUsageId` via `stripe_event_id`.
 * Skips if balance &lt; charge (usage row still committed elsewhere).
 */
export async function applyInferenceUsageDebitInTx(
  tx: BillingDbTx,
  params: {
    userId: string;
    inferenceUsageId: string;
    agentId: string;
    tokensIn: number;
    tokensOut: number;
    model: string;
    chargeMinor: number;
  }
): Promise<boolean> {
  const { userId, inferenceUsageId, agentId, tokensIn, tokensOut, model, chargeMinor } = params;
  if (chargeMinor <= 0) return false;

  const balance = await getWalletBalanceMinor(tx, userId);
  if (balance < chargeMinor) {
    log.debug("billing.usage.insufficient_balance", {
      userId,
      agentId,
      inferenceUsageId,
      balance,
      chargeMinor,
    });
    return false;
  }

  const currency = (await getWalletCurrency(tx, userId)).toLowerCase();
  const stripeEventId = `${USAGE_LEDGER_PREFIX}${inferenceUsageId}`;

  const [inserted] = await tx
    .insert(billingLedgerEntries)
    .values({
      userId,
      stripeEventId,
      entryType: "usage_debit",
      amountMinor: chargeMinor,
      currency,
      details: {
        agentId,
        inferenceUsageId,
        model,
        tokensIn,
        tokensOut,
      },
    })
    .onConflictDoNothing({ target: billingLedgerEntries.stripeEventId })
    .returning({ id: billingLedgerEntries.id });

  if (!inserted) {
    log.debug("billing.usage.duplicate_ledger", { stripeEventId, inferenceUsageId });
    return false;
  }

  await bumpWallet(tx, { userId, deltaMinor: -chargeMinor, currency });

  log.info("billing.usage.debited", {
    userId,
    agentId,
    inferenceUsageId,
    chargeMinor,
    currency,
  });
  return true;
}
