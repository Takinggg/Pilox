CREATE TABLE IF NOT EXISTS "instance_runtime_config_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "config_key" varchar(128) NOT NULL,
  "old_value" text,
  "new_value" text,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "ip_address" varchar(45),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "instance_runtime_config_audit_created_at_idx"
  ON "instance_runtime_config_audit" ("created_at" DESC);
