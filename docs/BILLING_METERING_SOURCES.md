# Billing and metering — where things live

Single map of **money**, **usage**, and **quota** across the repo. These are **not** one database today; integrate deliberately.

## 1. Main Hive app (`app/`) — Next.js

| Concern | Mechanism | Notes |
|--------|-----------|--------|
| **Payments & top-up** | Stripe Checkout / Portal; **`POST /api/webhooks/stripe`** | Signature + idempotent apply to ledger + wallet. |
| **Balance & ledger** | **`user_wallet_balances`**, **`billing_ledger_entries`** | API: `GET /api/billing/wallet`, `GET /api/billing/ledger`. |
| **Inference usage (observability)** | **`inference_usage`**, `agents.totalTokensIn/Out` | Populated by **`token-sync`** (Redis `hive:agent:tokens:*`) and/or **`recordInferenceUsage`** in `app/src/lib/inference-meter.ts` depending on path. |
| **Wallet debit for inference (optional)** | Env **`BILLING_USAGE_MINOR_PER_1K_TOKENS`** + **`app/src/lib/token-sync.ts`** | Debits agent **owner**; ledger type **`usage_debit`**; skipped if balance too low. |

Configuration: `docs/PRODUCTION.md` (section 2.1), `app/.env.example` (`STRIPE_*`, `BILLING_USAGE_MINOR_PER_1K_TOKENS`).

## 2. Standalone marketplace service (`app/Hive market-place/`)

| Concern | Mechanism | Notes |
|--------|-----------|--------|
| **Registry / node metering** | **`usage-metering.mjs`** — e.g. **`POST /v1/usage/report`** | Bearer **`MARKETPLACE_NODE_SECRET`**; per **access token** quota in **this service’s DB** (`consumeTokenQuota`, etc.). |

This path serves **marketplace access tokens** and remote node reporting. It does **not** automatically update the main app’s **`user_wallet_balances`**.

## 3. Unification (future)

- **Today:** treat **(1)** and **(2)** as separate products: document which UX promises “Hive wallet” vs “marketplace token quota”.
- **Next steps (product/eng):** define whether marketplace usage should **mirror** into app Postgres (event bus, periodic sync, or shared DB) — requires an ADR and likely legal/commercial alignment.

## Related

- **ADR:** [`ADR/001-billing-stripe-internal-credits.md`](./ADR/001-billing-stripe-internal-credits.md)
- **Roadmap checklist:** `docs/ROADMAP_2026_ENGINEERING_CHECKLIST.md` (S3, S4)
