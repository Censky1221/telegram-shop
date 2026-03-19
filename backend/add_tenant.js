require('dotenv').config();
const {pool} = require('./src/db/pool');
pool.query(
  'INSERT INTO tenants (name, bot_token, status, plan) VALUES ($1, $2, $3, $4) RETURNING *',
  ['Censky Store', '8547226885:AAGbyg0c0OQCVxTFe60-6FZ8O9sdfAcwDnM', 'active', 'basic']
).then(r => console.log('OK:', r.rows[0])).catch(console.error).finally(() => process.exit());
