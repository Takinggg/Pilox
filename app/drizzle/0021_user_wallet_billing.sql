-- Stripe wallet: user balance + append-only ledger (idempotent by stripe_event_id)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_customer_id" varchar(255);
CREATE UNIQUE INDEX IF NOT EXISTS "users_stripe_customer_id_unique" ON "users" ("stripe_customer_id");

CREATE TABLE IF NOT EXISTS "user_wallet_balances" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "balance_minor" integer NOT NULL DEFAULT 0,
  "currency" varchar(3) NOT NULL DEFAULT 'usd',
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "billing_ledger_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "stripe_event_id" varchar(255) NOT NULL UNIQUE,
  "stripe_payment_intent_id" varchar(128),
  "stripe_refund_id" varchar(128),
  "entry_type" varchar(24) NOT NULL,
  "amount_minor" integer NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'usd',
  "details" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "billing_ledger_entries_user_id_idx" ON "billing_ledger_entries" ("user_id");
CREATE INDEX IF NOT EXISTS "billing_ledger_entries_pi_idx" ON "billing_ledger_entries" ("stripe_payment_intent_id");
