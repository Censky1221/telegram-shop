const { pool } = require('./src/db/pool');
const sql = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, telegram_id BIGINT UNIQUE NOT NULL, username VARCHAR(100), first_name VARCHAR(100), balance BIGINT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, description TEXT, price INTEGER NOT NULL, is_active BOOLEAN DEFAULT true, image_url TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS stocks (id SERIAL PRIMARY KEY, product_id INTEGER REFERENCES products(id) ON DELETE CASCADE, email VARCHAR(300) NOT NULL, password VARCHAR(300) NOT NULL, status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available','sold','reserved')), order_id INTEGER, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), product_id INTEGER REFERENCES products(id), stock_id INTEGER REFERENCES stocks(id), payment_id VARCHAR(200) UNIQUE, payment_url TEXT, amount INTEGER NOT NULL, qty INTEGER DEFAULT 1, status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','expired')), created_at TIMESTAMPTZ DEFAULT NOW(), paid_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS admins (id SERIAL PRIMARY KEY, email VARCHAR(200) UNIQUE NOT NULL, password_hash VARCHAR(200) NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_stocks_product_status ON stocks(product_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_id ON orders(payment_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_id);

-- ── 009 Votes / Polling ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS votes (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  title       VARCHAR(500) NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT true,
  is_multiple BOOLEAN DEFAULT false,
  ended_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS vote_options (
  id         SERIAL PRIMARY KEY,
  vote_id    INTEGER REFERENCES votes(id) ON DELETE CASCADE NOT NULL,
  label      VARCHAR(300) NOT NULL,
  emoji      VARCHAR(10) DEFAULT '',
  sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS vote_responses (
  id         SERIAL PRIMARY KEY,
  vote_id    INTEGER REFERENCES votes(id) ON DELETE CASCADE NOT NULL,
  option_id  INTEGER REFERENCES vote_options(id) ON DELETE CASCADE NOT NULL,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  voter_key  VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vote_id, option_id, voter_key)
);
CREATE INDEX IF NOT EXISTS idx_votes_tenant    ON votes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vote_opts_vote  ON vote_options(vote_id);
CREATE INDEX IF NOT EXISTS idx_vote_resp_vote  ON vote_responses(vote_id);
CREATE INDEX IF NOT EXISTS idx_vote_resp_voter ON vote_responses(voter_key);
`;
pool.query(sql).then(() => console.log('Migration OK')).catch(console.error).finally(() => process.exit());

