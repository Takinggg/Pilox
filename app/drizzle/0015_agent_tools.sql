-- Agent Tools — MCP servers, built-in functions, custom tools per agent
CREATE TABLE IF NOT EXISTS "agent_tools" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "type" varchar(50) NOT NULL,
  "server_url" text,
  "input_schema" jsonb,
  "output_schema" jsonb,
  "description" text,
  "enabled" boolean NOT NULL DEFAULT true,
  "config" jsonb DEFAULT '{}',
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "agent_tools_agent_id_idx" ON "agent_tools"("agent_id");
