-- Public Hub registry (instance-level URL + tenant key; instance token stored in secrets)
ALTER TABLE "instance_ui_settings" ADD COLUMN IF NOT EXISTS "public_registry_hub_url" text NOT NULL DEFAULT '';
ALTER TABLE "instance_ui_settings" ADD COLUMN IF NOT EXISTS "public_registry_tenant_key" text NOT NULL DEFAULT '';
