CREATE TABLE IF NOT EXISTS "mesh_agent_pins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "label" varchar(255) NOT NULL,
  "registry_handle" varchar(512),
  "connected_registry_id" uuid REFERENCES "connected_registries"("id") ON DELETE SET NULL,
  "agent_card_url" text NOT NULL,
  "json_rpc_url" text,
  "mesh_descriptor_url" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "mesh_agent_pins_user_card_uidx"
  ON "mesh_agent_pins" ("user_id", md5("agent_card_url"::text));

CREATE INDEX IF NOT EXISTS "mesh_agent_pins_user_id_idx" ON "mesh_agent_pins" ("user_id");
CREATE INDEX IF NOT EXISTS "mesh_agent_pins_agent_card_url_idx" ON "mesh_agent_pins" ("agent_card_url");
