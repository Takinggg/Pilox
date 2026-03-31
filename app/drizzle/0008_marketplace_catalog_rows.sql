CREATE TABLE IF NOT EXISTS "marketplace_catalog_rows" (
	"registry_id" uuid NOT NULL REFERENCES "connected_registries"("id") ON DELETE CASCADE,
	"handle" varchar(512) NOT NULL,
	"agent" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "marketplace_catalog_rows_registry_id_handle_pk" PRIMARY KEY("registry_id","handle")
);
CREATE INDEX IF NOT EXISTS "marketplace_catalog_rows_updated_at_idx" ON "marketplace_catalog_rows" ("updated_at");
