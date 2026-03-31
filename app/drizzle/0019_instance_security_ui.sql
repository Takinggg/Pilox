ALTER TABLE "instance_ui_settings" ADD COLUMN IF NOT EXISTS "egress_host_allowlist_append" text NOT NULL DEFAULT '';
ALTER TABLE "instance_ui_settings" ADD COLUMN IF NOT EXISTS "workflow_code_nodes_mode" varchar(16) NOT NULL DEFAULT 'inherit';
