-- ============================================================
-- Migration 009 - Votes / Poll System
-- ============================================================

CREATE TABLE IF NOT EXISTS votes (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  title       VARCHAR(500) NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT true,
  is_multiple BOOLEAN DEFAULT false,   -- allow multi-choice?
  ended_at    TIMESTAMPTZ,             -- NULL = no deadline
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vote_options (
  id       SERIAL PRIMARY KEY,
  vote_id  INTEGER REFERENCES votes(id) ON DELETE CASCADE NOT NULL,
  label    VARCHAR(300) NOT NULL,
  emoji    VARCHAR(10) DEFAULT '',
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS vote_responses (
  id        SERIAL PRIMARY KEY,
  vote_id   INTEGER REFERENCES votes(id) ON DELETE CASCADE NOT NULL,
  option_id INTEGER REFERENCES vote_options(id) ON DELETE CASCADE NOT NULL,
  user_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
  -- for anonymous/web votes without user_id:
  voter_key VARCHAR(200),   -- e.g. telegram_id or session key
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vote_id, option_id, voter_key)
);

CREATE INDEX IF NOT EXISTS idx_votes_tenant     ON votes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vote_opts_vote   ON vote_options(vote_id);
CREATE INDEX IF NOT EXISTS idx_vote_resp_vote   ON vote_responses(vote_id);
CREATE INDEX IF NOT EXISTS idx_vote_resp_voter  ON vote_responses(voter_key);
