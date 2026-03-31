CREATE TABLE IF NOT EXISTS "instance_ui_settings" (
  "id" integer PRIMARY KEY NOT NULL,
  "instance_name" varchar(255) NOT NULL DEFAULT 'Hive',
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "instance_ui_settings_singleton" CHECK ("id" = 1)
);

INSERT INTO "instance_ui_settings" ("id", "instance_name")
VALUES (1, 'Hive')
ON CONFLICT ("id") DO NOTHING;
