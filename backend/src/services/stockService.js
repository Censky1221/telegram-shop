const { pool } = require('../db/pool');

async function assignStockAndDeliver(order, tenantId) {
  // Gunakan tenant_id dari order jika tidak di-pass
  const tid = tenantId || order.tenant_id;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock satu stock available
    const { rows: [stock] } = await client.query(
      `SELECT id, email, password
       FROM stocks
       WHERE product_id = $1
         AND status = 'available'
         AND tenant_id = $2
       ORDER BY id ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [order.product_id, tid]
    );

    if (!stock) {
      await client.query('ROLLBACK');
      console.error(`OUT OF STOCK: Order #${order.id} paid but no stock for product #${order.product_id} tenant #${tid}`);
      await notifyAdminOutOfStock(order, tid);
      return { success: false, reason: 'out_of_stock' };
    }

    // 2. Mark stock as sold
    await client.query(
      `UPDATE stocks SET status = 'sold', order_id = $1 WHERE id = $2`,
      [order.id, stock.id]
    );

    // 3. Mark order as paid
    await client.query(
      `UPDATE orders SET status = 'paid', stock_id = $1, paid_at = NOW() WHERE id = $2`,
      [stock.id, order.id]
    );

    // 4. Fetch telegram_id & product name
    const { rows: [info] } = await client.query(
      `SELECT u.telegram_id, p.name AS product_name
       FROM users u
       JOIN orders o ON o.user_id = u.id
       JOIN products p ON p.id = o.product_id
       WHERE o.id = $1`,
      [order.id]
    );

    // 5. Commit dulu sebelum kirim pesan
    await client.query('COMMIT');

    // 6. Kirim credentials via bot tenant
    if (info) {
      await deliverCredentials(info.telegram_id, info.product_name, stock, tid);
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

async function deliverCredentials(telegramId, productName, stock, tenantId) {
  const { getBotByTenantId } = require('../bot/tenantManager');
  const bot = getBotByTenantId(tenantId);

  if (!bot) {
    console.error(`Bot not found for tenant #${tenantId}`);
    return;
  }

  const message =
    `🎉 *Pembayaran Berhasil!*\n\n` +
    `Terima kasih atas pembelian Anda.\n\n` +
    `📦 Produk: *${productName}*\n\n` +
    `─────────────────\n` +
    `📧 Email   : \`${stock.email}\`\n` +
    `🔐 Password: \`${stock.password}\`\n` +
    `─────────────────\n\n` +
    `⚠️ *Penting:*\n` +
    `• Ganti password setelah login pertama\n` +
    `• Simpan pesan ini dengan aman\n` +
    `• Kami tidak dapat mengirim ulang kredensial ini\n\n` +
    `Terima kasih telah berbelanja! 🙏`;

  await bot.telegram.sendMessage(telegramId, message, { parse_mode: 'Markdown' });
}

async function notifyAdminOutOfStock(order, tenantId) {
  const { getBotByTenantId } = require('../bot/tenantManager');
  const bot = getBotByTenantId(tenantId);
  if (!bot) return;

  // Ambil admin telegram ID dari tenant (opsional)
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (!adminId) return;

  await bot.telegram.sendMessage(
    adminId,
    `⚠️ *STOK HABIS!*\n\n` +
    `Order #${order.id} telah dibayar tapi produk #${order.product_id} tidak punya stok!\n\n` +
    `Tambah stok segera.`,
    { parse_mode: 'Markdown' }
  );
}

module.exports = { assignStockAndDeliver };