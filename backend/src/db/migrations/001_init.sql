-- ============================================================
-- Telegram Shop - Database Migration 001
-- Run: psql $DATABASE_URL -f src/db/migrations/001_init.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -------------------------------------------------------
-- Users (Telegram users who interact with the bot)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  username    VARCHAR(100),
  first_name  VARCHAR(100),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- Products catalog
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  description TEXT,
  price       INTEGER NOT NULL, -- in IDR (whole number, e.g. 50000)
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- Stocks (each row = one account credential)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS stocks (
  id         SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  email      VARCHAR(300) NOT NULL,
  password   VARCHAR(300) NOT NULL,
  status     VARCHAR(20) DEFAULT 'available'
             CHECK (status IN ('available', 'sold', 'reserved')),
  order_id   INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- Orders
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  product_id  INTEGER REFERENCES products(id),
  stock_id    INTEGER REFERENCES stocks(id),
  payment_id  VARCHAR(200) UNIQUE,
  payment_url TEXT,
  amount      INTEGER NOT NULL,
  status      VARCHAR(20) DEFAULT 'pending'
              CHECK (status IN ('pending', 'paid', 'failed', 'expired')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  paid_at     TIMESTAMPTZ
);

-- Add FK from stocks back to orders
ALTER TABLE stocks
  ADD CONSTRAINT IF NOT EXISTS fk_stock_order
  FOREIGN KEY (order_id) REFERENCES orders(id);

-- -------------------------------------------------------
-- Admin users (dashboard login)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(200) UNIQUE NOT NULL,
  password_hash VARCHAR(200) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- Indexes for performance
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_stocks_product_status ON stocks(product_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_id     ON orders(payment_id);
CREATE INDEX IF NOT EXISTS idx_orders_user           ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_users_telegram        ON users(telegram_id);
