-- ============================================================
-- Migration 011 - Onboarding Flag
-- ============================================================

-- Tambah kolom ke tabel users untuk track apakah sudah selesai onboarding
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_done BOOLEAN DEFAULT false;
