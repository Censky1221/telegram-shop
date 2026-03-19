-- Migration 004: Tambah kolom Pakasir di tabel tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pakasir_api_key      VARCHAR(200);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pakasir_project_slug VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payment_gateway      VARCHAR(20) DEFAULT 'tripay';
-- payment_gateway: 'tripay' atau 'pakasir'
