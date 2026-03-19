-- ============================================================
-- Migration 002 - Multi Tenant Support
-- ============================================================

-- Tabel tenants
CREATE TABLE IF NOT EXISTS tenants (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  bot_token   VARCHAR(200) UNIQUE NOT NULL,
  status      VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expired')),
  plan        VARCHAR(20) DEFAULT 'basic',
  expired_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Tambah tenant_id ke semua tabel
ALTER TABLE users    ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE stocks   ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE orders   ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE admins   ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE;
-- tenant_id NULL = super admin

-- Index baru
CREATE INDEX IF NOT EXISTS idx_users_tenant    ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stocks_tenant   ON stocks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant   ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_admins_tenant   ON admins(tenant_id);