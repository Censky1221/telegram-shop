const { pool } = require('../db/pool');

// JANGAN require bot di sini — menyebabkan circular dependency!

/**
 * Atomically assigns one stock item to an order and sends credentials to user.
 * Uses PostgreSQL FOR UPDATE SKIP LOCKED to prevent race conditions.
 *
 * @param {object} order - The order row from DB
 */
async function assignStockAndDeliver(order) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock one available stock row — SKIP LOCKED prevents double-assignment
    const { rows: [stock] } = await client.query(
      `SELECT id, email, password
       FROM stocks
       WHERE product_id = $1
         AND status = 'available'
       ORDER BY id ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [order.product_id]
    );

    if (!stock) {
      await client.query('ROLLBACK');
      console.error(`OUT OF STOCK: Order #${order.id} paid but no stock left for product #${order.product_id}`);
      await notifyAdminOutOfStock(order);
      return { success: false, reason: 'out_of_stock' };
    }

    // 2. Mark stock as sold and link to this order
    await client.query(
      `UPDATE stocks SET status = 'sold', order_id = $1 WHERE id = $2`,
      [order.id, stock.id]
    );

    // 3. Mark order as paid, record stock assignment and timestamp
    await client.query(
      `UPDATE orders
       SET status = 'paid', stock_id = $1, paid_at = NOW()
       WHERE id = $2`,
      [stock.id, order.id]
    );

    // 4. Fetch user telegram_id + product name (needed for delivery)
    const { rows: [info] } = await client.query(
      `SELECT u.telegram_id, p.name AS product_name
       FROM users u
       JOIN orders o ON o.user_id = u.id
       JOIN products p ON p.id = o.product_id
       WHERE o.id = $1`,
      [order.id]
    );

    // 5. Commit BEFORE sending message (don't hold transaction while calling Telegram)
    await client.query('COMMIT');

    // 6. Deliver credentials via Telegram
    if (info) {
      await deliverCredentials(info.telegram_id, info.product_name, stock);
    }

    return { success: true };

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('assignStockAndDeliver error:', err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Send account credentials to the buyer via Telegram
 */
async function deliverCredentials(telegramId, productName, stock) {
  // Require bot di dalam function untuk hindari circular dependency
  const bot = require('../bot');

  const message =
    `🎉 *Pembayaran Berhasil!*\n\n` +
    `Terima kasih atas pembelian Anda.\n\n` +
    `📦 Produk: *${productName}*\n\n` +
    `─────────────────\n` +
    `📧 Email   : \`${stock.email}\`\n` +
    `🔑 Password: \`${stock.password}\`\n` +
    `─────────────────\n\n` +
    `⚠️ *Penting:*\n` +
    `• Ganti password setelah login pertama\n` +
    `• Simpan pesan ini dengan aman\n` +
    `• Kami tidak dapat mengirim ulang kredensial ini\n\n` +
    `Terima kasih telah berbelanja! 🙏`;

  await bot.telegram.sendMessage(telegramId, message, {
    parse_mode: 'Markdown',
  });
}

/**
 * Alert admin when a paid order has no stock to fulfill
 */
async function notifyAdminOutOfStock(order) {
  // Require bot di dalam function untuk hindari circular dependency
  const bot = require('../bot');

  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (!adminId) return;

  await bot.telegram.sendMessage(
    adminId,
    `⚠️ *STOK HABIS - PERLU TINDAKAN!*\n\n` +
    `Order #${order.id} telah dibayar (ID: \`${order.payment_id}\`)\n` +
    `tapi produk #${order.product_id} tidak memiliki stok!\n\n` +
    `Tambah stok segera dan kirim akun secara manual.`,
    { parse_mode: 'Markdown' }
  );
}

module.exports = { assignStockAndDeliver };