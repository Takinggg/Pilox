-- Runtime overrides for env-backed settings (admin-editable via dashboard).
CREATE TABLE IF NOT EXISTS "instance_runtime_config" (
  "key" varchar(128) PRIMARY KEY NOT NULL,
  "value" text NOT NULL DEFAULT '',
  "updated_at" timestamp DEFAULT now() NOT NULL
);
