-- Agent visibility levels for mesh federation privacy control.
-- 'private': local only (default)
-- 'federation': visible to federated peers only
-- 'public': published to global registry
ALTER TABLE agents ADD COLUMN IF NOT EXISTS visibility varchar(20) NOT NULL DEFAULT 'private';

CREATE INDEX IF NOT EXISTS idx_agents_visibility ON agents (visibility) WHERE visibility != 'private';
