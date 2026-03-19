-- ============================================================
-- Migration 005 - Product Variants
-- Run: psql $DATABASE_URL -f src/db/migrations/005_product_variants.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS product_variants (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER REFERENCES products(id) ON DELETE CASCADE,
  tenant_id   INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,
  description TEXT,
  price       INTEGER NOT NULL,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE stocks ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_tenant  ON product_variants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stocks_variant   ON stocks(variant_id);
