// migrate_referral.js — run migration 010_referral.sql
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const sql = fs.readFileSync(
    path.join(__dirname, 'src/db/migrations/010_referral.sql'),
    'utf8'
  );
  console.log('▶ Running migration 010_referral.sql ...');
  try {
    await pool.query(sql);
    console.log('✅ Migration 010_referral.sql applied successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
