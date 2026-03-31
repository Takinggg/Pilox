-- MFA (TOTP) fields for users table
-- Adds support for Two-Factor Authentication

ALTER TABLE users
ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS mfa_secret TEXT,
ADD COLUMN IF NOT EXISTS mfa_pending_secret TEXT,
ADD COLUMN IF NOT EXISTS mfa_attempts INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS mfa_lockout_until TIMESTAMP WITH TIME ZONE;

-- Index for quick MFA lookups
CREATE INDEX IF NOT EXISTS users_mfa_enabled_idx ON users (mfa_enabled) WHERE mfa_enabled = TRUE;
