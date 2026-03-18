/**
 * Run: node scripts/createAdmin.js
 * Creates the first admin account for the dashboard.
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../src/db/pool');

const EMAIL    = process.env.ADMIN_EMAIL    || 'admin@yourshop.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 12);
  await pool.query(
    `INSERT INTO admins (email, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [EMAIL, hash]
  );
  console.log(`✅ Admin created: ${EMAIL}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
