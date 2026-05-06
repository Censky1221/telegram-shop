-- ============================================================
-- Migration 012 - Ban / Unban User
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned  BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason  TEXT;

CREATE INDEX IF NOT EXISTS idx_users_banned ON users(tenant_id, is_banned);
