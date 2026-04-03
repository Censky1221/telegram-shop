const { Client } = require('pg');
const pool = require('../config/db'); // sesuaikan

module.exports = async function startStockListener(bot) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query('LISTEN stock_update');

  client.on('notification', async (msg) => {
    const data = JSON.parse(msg.payload);

    const { rows } = await pool.query(
      'SELECT COUNT(*) FROM stocks WHERE order_id=$1',
      [data.order_id]
    );

    const total = parseInt(rows[0].count);

    const { rows: [order] } = await pool.query(
      'SELECT qty FROM orders WHERE id=$1',
      [data.order_id]
    );

    if (total > order.qty) {
      await bot.telegram.sendMessage(
        process.env.ADMIN_ID,
        `🚨 OVER STOCK!\nOrder: ${data.order_id}\nQty: ${order.qty}\nTerambil: ${total}`
      );
    }
  });
};