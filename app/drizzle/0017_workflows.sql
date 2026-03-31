-- Workflows & workflow runs — visual workflow builder persistence
CREATE TABLE IF NOT EXISTS "workflows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(255) NOT NULL,
  "description" text,
  "graph" jsonb NOT NULL DEFAULT '{}',
  "status" varchar(50) NOT NULL DEFAULT 'draft',
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "workflows_created_by_idx" ON "workflows"("created_by");

CREATE TABLE IF NOT EXISTS "workflow_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workflow_id" uuid NOT NULL REFERENCES "workflows"("id") ON DELETE CASCADE,
  "status" varchar(50) NOT NULL DEFAULT 'running',
  "input" jsonb,
  "output" jsonb,
  "started_at" timestamp NOT NULL DEFAULT now(),
  "completed_at" timestamp
);
CREATE INDEX IF NOT EXISTS "workflow_runs_workflow_id_idx" ON "workflow_runs"("workflow_id");
