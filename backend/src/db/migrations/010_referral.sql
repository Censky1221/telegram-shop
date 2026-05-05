-- ============================================================
-- Migration 010 - Referral System & Withdrawal
-- ============================================================

-- Tambah kolom ke tabel users
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by   INTEGER REFERENCES users(id);

-- Setting referral per tenant
CREATE TABLE IF NOT EXISTS referral_settings (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  bonus_amount INTEGER DEFAULT 500,       -- bonus ke referrer (Rp)
  is_active    BOOLEAN DEFAULT true,
  min_withdraw INTEGER DEFAULT 10000,     -- minimum penarikan (Rp)
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Log setiap bonus referral yang diberikan
CREATE TABLE IF NOT EXISTS referrals (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER NOT NULL,
  referrer_id  INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  referred_id  INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  order_id     INTEGER,
  bonus_amount INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, referred_id) -- 1 user hanya bisa direferral 1x
);

-- Permintaan penarikan saldo
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER NOT NULL,
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  amount       INTEGER NOT NULL,
  method       VARCHAR(50),       -- Seabank/BCA/BRI/Mandiri/GoPay/OVO/Dana
  account_info TEXT,              -- nomor rekening/e-wallet
  account_name VARCHAR(200),      -- nama pemilik
  status       VARCHAR(20) DEFAULT 'pending'
               CHECK (status IN ('pending','approved','paid','rejected')),
  admin_note   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer  ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred  ON referrals(referred_id);
CREATE INDEX IF NOT EXISTS idx_withdraw_tenant     ON withdrawal_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_withdraw_user       ON withdrawal_requests(user_id);
