-- Migration: tambah kolom terms (S&K) ke tabel tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS terms TEXT;
