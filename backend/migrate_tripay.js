require('dotenv').config();
const {pool} = require('./src/db/pool');
pool.query(`
  ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tripay_api_key VARCHAR(200);
  ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tripay_private_key VARCHAR(200);
  ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tripay_merchant_code VARCHAR(50);
  ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tripay_mode VARCHAR(20) DEFAULT 'sandbox';
`).then(() => console.log('Migration OK')).catch(console.error).finally(() => process.exit());
