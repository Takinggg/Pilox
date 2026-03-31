-- LLM Providers — multi-provider support (OpenAI, Anthropic, Azure, local, custom)
CREATE TABLE IF NOT EXISTS "llm_providers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(255) NOT NULL UNIQUE,
  "type" varchar(50) NOT NULL,
  "base_url" text,
  "api_key_secret_id" uuid REFERENCES "secrets"("id") ON DELETE SET NULL,
  "models" jsonb NOT NULL DEFAULT '[]',
  "is_default" boolean NOT NULL DEFAULT false,
  "enabled" boolean NOT NULL DEFAULT true,
  "rate_limits" jsonb DEFAULT '{}',
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "llm_providers_type_idx" ON "llm_providers"("type");
