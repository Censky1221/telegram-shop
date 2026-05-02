/**
 * migrate_web.js
 * Jalankan migration tabel web_orders ke database Railway.
 * 
 * Cara pakai:
 *   node migrate_web.js
 * 
 * Pastikan .env sudah berisi DATABASE_URL yang benar.
 */
require('dotenv').config();
const { pool } = require('./src/db/pool');

const SQL = `
CREATE TABLE IF NOT EXISTS web_orders (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  product_id      INTEGER REFERENCES products(id),
  variant_id      INTEGER,
  buyer_email     VARCHAR(300) NOT NULL,
  buyer_name      VARCHAR(200),
  qty             INTEGER DEFAULT 1,
  amount          INTEGER NOT NULL,
  payment_id      VARCHAR(200) UNIQUE,
  payment_url     TEXT,
  payment_gateway VARCHAR(50) DEFAULT 'tripay',
  status          VARCHAR(20) DEFAULT 'pending'
                  CHECK (status IN ('pending', 'paid', 'failed', 'expired')),
  delivered       BOOLEAN DEFAULT false,
  delivery_content TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  paid_at         TIMESTAMPTZ,
  expired_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_web_orders_tenant  ON web_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_web_orders_payment ON web_orders(payment_id);
CREATE INDEX IF NOT EXISTS idx_web_orders_email   ON web_orders(buyer_email);
CREATE INDEX IF NOT EXISTS idx_web_orders_status  ON web_orders(status);
`;

(async () => {
  try {
    await pool.query(SQL);
    console.log('✅ Migration web_orders berhasil!');
  } catch (err) {
    console.error('❌ Migration gagal:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
