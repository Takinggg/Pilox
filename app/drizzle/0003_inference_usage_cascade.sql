-- Hive schema gap fix + FK cascade hardening (must run after 0002).
-- Previously this file only altered inference_usage, but the table was never
-- created in 0000–0002 — fresh `migrate:run` failed. This migration is
-- idempotent where possible (IF NOT EXISTS / duplicate_object) so re-runs
-- and push-then-migrate setups are safer.

-- ── Enums (idempotent) ─────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "inference_tier" AS ENUM ('low', 'medium', 'high');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "agent_source_type" AS ENUM ('local', 'url-import', 'marketplace', 'registry');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── inference_usage (required before CASCADE tweaks below) ────────
CREATE TABLE IF NOT EXISTS "inference_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL,
  "model" varchar(255) NOT NULL,
  "tokens_in" integer DEFAULT 0 NOT NULL,
  "tokens_out" integer DEFAULT 0 NOT NULL,
  "duration_ms" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "inference_usage_agent_id_idx" ON "inference_usage" ("agent_id");
CREATE INDEX IF NOT EXISTS "inference_usage_created_at_idx" ON "inference_usage" ("created_at");

-- ── connected_registries (required before 0006 mesh_agent_pins) ───
CREATE TABLE IF NOT EXISTS "connected_registries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "url" varchar(2048) NOT NULL,
  "auth_token" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "record_count" integer DEFAULT 0,
  "last_sync_at" timestamp,
  "last_sync_status" varchar(50),
  "created_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- ── agents: columns added after initial snapshot (idempotent) ─────
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "inference_tier" inference_tier DEFAULT 'medium';
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "preferred_model" varchar(255);
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "total_tokens_in" integer DEFAULT 0;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "total_tokens_out" integer DEFAULT 0;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "last_active_at" timestamp;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "source_type" agent_source_type DEFAULT 'local';
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "source_url" text;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "manifest_version" varchar(50);

-- ── CASCADE / SET NULL: align FKs with current Drizzle schema ──────
ALTER TABLE "connected_registries" DROP CONSTRAINT IF EXISTS "connected_registries_created_by_users_id_fk";
ALTER TABLE "connected_registries" ADD CONSTRAINT "connected_registries_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "inference_usage" DROP CONSTRAINT IF EXISTS "inference_usage_agent_id_agents_id_fk";
ALTER TABLE "inference_usage" ADD CONSTRAINT "inference_usage_agent_id_agents_id_fk"
  FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE;

ALTER TABLE "secrets" DROP CONSTRAINT IF EXISTS "secrets_agent_id_agents_id_fk";
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_agent_id_agents_id_fk"
  FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE;

ALTER TABLE "agents" DROP CONSTRAINT IF EXISTS "agents_created_by_users_id_fk";
ALTER TABLE "agents" ADD CONSTRAINT "agents_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "agents" DROP CONSTRAINT IF EXISTS "agents_group_id_agent_groups_id_fk";
ALTER TABLE "agents" ADD CONSTRAINT "agents_group_id_agent_groups_id_fk"
  FOREIGN KEY ("group_id") REFERENCES "agent_groups"("id") ON DELETE SET NULL;

ALTER TABLE "api_tokens" DROP CONSTRAINT IF EXISTS "api_tokens_user_id_users_id_fk";
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
