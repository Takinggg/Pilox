ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deactivated_at" timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "failed_login_attempts" integer NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locked_until" timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "security_version" integer NOT NULL DEFAULT 0;

-- Align default role with app schema (new users = viewer unless promoted)
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'viewer';
