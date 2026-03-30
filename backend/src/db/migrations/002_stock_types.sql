-- ============================================================
-- Migration 002 - Stock Types (account, cookie, service)
-- Run: psql $DATABASE_URL -f src/db/migrations/002_stock_types.sql
-- ============================================================

-- Tambah kolom stock_type dan content di tabel stocks
ALTER TABLE stocks
  ADD COLUMN IF NOT EXISTS stock_type VARCHAR(20) DEFAULT 'account'
    CHECK (stock_type IN ('account', 'cookie', 'service')),
  ADD COLUMN IF NOT EXISTS content TEXT; -- untuk cookie/service

-- Untuk stock_type='account' : email + password (sudah ada)
-- Untuk stock_type='cookie'  : content = isi cookie (teks/JSON)
-- Untuk stock_type='service' : content = instruksi jasa (dikirim ke user setelah mereka input email)

-- Jadikan email & password nullable (karena cookie/service tidak pakai)
ALTER TABLE stocks
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN password DROP NOT NULL;

-- Tabel untuk menyimpan request jasa (email pembeli)
CREATE TABLE IF NOT EXISTS service_requests (
  id          SERIAL PRIMARY KEY,
  order_id    INTEGER REFERENCES orders(id),
  user_id     INTEGER REFERENCES users(id),
  tenant_id   INTEGER,
  buyer_email VARCHAR(300) NOT NULL,       -- email yang diinput user
  status      VARCHAR(20) DEFAULT 'pending'
              CHECK (status IN ('pending', 'processing', 'done')),
  note        TEXT,                         -- catatan admin
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  done_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_service_requests_order   ON service_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_tenant  ON service_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_status  ON service_requests(status);
CREATE INDEX IF NOT EXISTS idx_stocks_type              ON stocks(stock_type);
