-- Speed up paginated ledger reads per user (Settings → Billing)
CREATE INDEX IF NOT EXISTS "billing_ledger_entries_user_created_idx"
  ON "billing_ledger_entries" ("user_id", "created_at" DESC);
