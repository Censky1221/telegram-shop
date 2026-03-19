-- Migration: tambah kolom banner_file_id ke tabel tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS banner_file_id TEXT;
