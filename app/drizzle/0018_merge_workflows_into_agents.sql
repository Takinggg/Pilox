-- Merge workflows into agents: agents can now have an internal workflow graph
-- agent_type: 'simple' (single model) or 'composed' (visual canvas with sub-agents)

ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "graph" jsonb;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "agent_type" varchar(20) NOT NULL DEFAULT 'simple';

-- Move workflow_runs FK from workflows to agents
ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "agent_id" uuid REFERENCES "agents"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "workflow_runs_agent_id_idx" ON "workflow_runs"("agent_id");

-- Migrate any existing workflow_runs by matching workflow name to agent name (best-effort)
UPDATE "workflow_runs" wr
SET "agent_id" = a."id"
FROM "workflows" w
JOIN "agents" a ON a."name" = w."name"
WHERE wr."workflow_id" = w."id" AND wr."agent_id" IS NULL;

-- Drop old FK column (workflow_runs.workflow_id)
ALTER TABLE "workflow_runs" DROP CONSTRAINT IF EXISTS "workflow_runs_workflow_id_workflows_id_fk";
DROP INDEX IF EXISTS "workflow_runs_workflow_id_idx";
ALTER TABLE "workflow_runs" DROP COLUMN IF EXISTS "workflow_id";

-- Don't drop workflows table yet — keep for rollback safety
-- DROP TABLE IF EXISTS "workflows";
