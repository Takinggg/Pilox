# ADR 001: Stripe payments + internal wallet credits

**Status:** Accepted  
**Date:** 2026-03-26  
**Scope:** Main Hive app (`app/`) — user-facing billing, not the standalone `app/Hive market-place` service quota model.

## Context

Hive needs a clear way to:

- Accept **payments** (top-ups, optional subscriptions) with industry-standard tooling.
- Maintain an **auditable balance** and **ledger** per user for product features (credits, future org billing).
- Optionally **charge for inference** without requiring Stripe Billing Metering for every deployment.

Legal/commercial review remains mandatory before public monetization; this ADR only fixes **technical** boundaries.

## Decision

1. **Stripe** is the **payment rail**: Checkout (one-time and subscription where configured), Customer Portal, and **webhooks** as the source of truth for money-in events (`payment_intent.succeeded`, `invoice.paid`, refunds, etc.).
2. **Postgres** holds **authoritative balance** (`user_wallet_balances`) and an **append-only ledger** (`billing_ledger_entries`), keyed by unique `stripe_event_id` for Stripe-driven rows and synthetic ids (`hive_usage:…`) for internal metering lines.
3. **Internal credits** are the product currency: webhook handlers **credit** the wallet; optional **usage debits** subtract from balance using the same ledger (no separate Stripe Metering API required for the MVP path).
4. **Inference metering** for the main app uses existing **token tracking** (Redis counters → `inference_usage` via token sync) plus env **`BILLING_USAGE_MINOR_PER_1K_TOKENS`**. Debits attach to the **agent owner** (`agents.created_by`). If balance is insufficient, usage is still recorded but **no debit** is applied (documented behavior; hard enforcement may come later).
5. **Future options** (not decided here): Stripe Billing Metering, org-level wallets, negative balances, or unifying with the marketplace service’s access-token quota — see [`BILLING_METERING_SOURCES.md`](../BILLING_METERING_SOURCES.md).

## Consequences

- Operators must configure **`STRIPE_WEBHOOK_SECRET`** (and related Stripe keys) and run DB migrations for wallet tables; see `docs/PRODUCTION.md` (section 2.1).
- Product and legal must align on **refunds, chargebacks, and tax** before marketing paid features; code idempotency does not replace policy.
- The standalone marketplace registry service remains a **separate metering surface** until an explicit integration ADR merges it with app wallets.

## References

- `app/src/lib/stripe/process-stripe-webhook.ts`, `app/src/lib/stripe/stripe-wallet-handlers.ts`
- `app/src/lib/billing/inference-usage-billing.ts`, `app/src/lib/token-sync.ts`
- `docs/PRODUCTION.md`, `docs/STRIPE_LOCAL_DEV.md`
