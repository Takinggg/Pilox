-- Optimize time-series tables for query performance at scale.
-- PostgreSQL doesn't support declarative partitioning on existing tables,
-- so we add BRIN indexes (block range) which are ideal for append-only time-series data.

-- audit_logs: BRIN index on created_at for fast time-range queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at_brin
  ON audit_logs USING BRIN (created_at) WITH (pages_per_range = 32);

-- audit_logs: composite index for user-scoped queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
  ON audit_logs (user_id, created_at DESC);

-- billing_ledger_entries: BRIN index for time-range billing queries
CREATE INDEX IF NOT EXISTS idx_billing_ledger_created_at_brin
  ON billing_ledger_entries USING BRIN (created_at) WITH (pages_per_range = 32);

-- chat_messages: BRIN index for conversation history pagination
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at_brin
  ON chat_messages USING BRIN (created_at) WITH (pages_per_range = 32);

-- Add retention policy comment (implement via pg_cron or app-level job)
COMMENT ON INDEX idx_audit_logs_created_at_brin IS
  'BRIN index for time-series queries. Consider pg_cron retention: DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL ''90 days''';
