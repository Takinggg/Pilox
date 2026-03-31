-- Budget enforcement & cost tracking columns
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "budget_max_tokens_day" integer;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "budget_max_cost_month" numeric(10,4);
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "budget_alert_webhook" text;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "llm_provider_id" uuid
  REFERENCES "llm_providers"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "agents_llm_provider_id_idx" ON "agents"("llm_provider_id");

ALTER TABLE "inference_usage" ADD COLUMN IF NOT EXISTS "cost_usd" numeric(10,6);
ALTER TABLE "inference_usage" ADD COLUMN IF NOT EXISTS "provider_type" varchar(50);
