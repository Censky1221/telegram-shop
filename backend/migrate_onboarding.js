// migrate_onboarding.js — run migration 011_onboarding.sql
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const sql = fs.readFileSync(
    path.join(__dirname, 'src/db/migrations/011_onboarding.sql'),
    'utf8'
  );
  console.log('▶ Running migration 011_onboarding.sql ...');
  try {
    await pool.query(sql);
    console.log('✅ Migration 011_onboarding.sql applied successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
