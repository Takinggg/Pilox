CREATE TABLE IF NOT EXISTS "marketplace_agent_local_stats" (
  "registry_id" uuid NOT NULL REFERENCES "connected_registries"("id") ON DELETE CASCADE,
  "handle" varchar(512) NOT NULL,
  "deploy_count" integer NOT NULL DEFAULT 0,
  "last_deployed_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "marketplace_agent_local_stats_registry_id_handle_pk" PRIMARY KEY ("registry_id", "handle")
);
