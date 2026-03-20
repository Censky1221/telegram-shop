const { pool } = require('../db/pool');

async function assignStockAndDeliver(order, tenantId) {
  const tid    = tenantId || order.tenant_id;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const stockQuery = order.variant_id
      ? `SELECT id, email, password
         FROM stocks
         WHERE variant_id = $1
           AND status = 'available'
           AND tenant_id = $2
         ORDER BY id ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`
      : `SELECT id, email, password
         FROM stocks
         WHERE product_id = $1
           AND variant_id IS NULL
           AND status = 'available'
           AND tenant_id = $2
         ORDER BY id ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`;

    const stockParam = order.variant_id
      ? [order.variant_id, tid]
      : [order.product_id, tid];

    const { rows: [stock] } = await client.query(stockQuery, stockParam);

    if (!stock) {
      await client.query('ROLLBACK');
      console.error(`OUT OF STOCK: Order #${order.id} paid but no stock available. variant_id=${order.variant_id} product_id=${order.product_id} tenant=${tid}`);
      await notifyAdminOutOfStock(order, tid);
      return { success: false, reason: 'out_of_stock' };
    }

    await client.query(
      `UPDATE stocks SET status='sold', order_id=$1 WHERE id=$2`,
      [order.id, stock.id]
    );

    await client.query(
      `UPDATE orders SET status='paid', stock_id=$1, paid_at=NOW() WHERE id=$2`,
      [stock.id, order.id]
    );

    // Ambil info user, produk, varian + terms dari produk
    const { rows: [info] } = await client.query(
      `SELECT u.telegram_id,
              p.name AS product_name,
              p.terms AS product_terms,
              pv.name AS variant_name
       FROM users u
       JOIN orders o ON o.user_id = u.id
       JOIN products p ON p.id = o.product_id
       LEFT JOIN product_variants pv ON pv.id = o.variant_id
       WHERE o.id = $1`,
      [order.id]
    );

    await client.query('COMMIT');

    if (info) {
      await deliverCredentials(info.telegram_id, info.product_name, info.variant_name, info.product_terms, stock, order.id, tid);
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

async function deliverCredentials(telegramId, productName, variantName, productTerms, stock, orderId, tenantId) {
  const { getBotByTenantId } = require('../bot/tenantManager');
  const bot = getBotByTenantId(tenantId);
  if (!bot) {
    console.error(`Bot not found for tenant #${tenantId}`);
    return;
  }

  const prodLabel = variantName ? `${productName} - ${variantName}` : productName;

  const termsText = productTerms
    ? productTerms
    : `⚠️ *Penting:*\n• Ganti password setelah login pertama\n• Simpan pesan ini dengan aman\n• Kami tidak dapat mengirim ulang kredensial ini`;

  const message =
    `🎉 *Pembayaran Berhasil!*\n\n` +
    `Terima kasih atas pembelian Anda.\n\n` +
    `📦 Produk: *${prodLabel}*\n` +
    `🧾 ID Pesanan: *#${orderId}*\n\n` +
    `─────────────────\n` +
    `📧 Email   : \`${stock.email}\`\n` +
    `🔐 Password: \`${stock.password}\`\n` +
    `─────────────────\n\n` +
    `${termsText}\n\n` +
    `Terima kasih telah berbelanja! 🙏`;

  await bot.telegram.sendMessage(telegramId, message, { parse_mode: 'Markdown' });
}

async function notifyAdminOutOfStock(order, tenantId) {
  const { getBotByTenantId } = require('../bot/tenantManager');
  const bot = getBotByTenantId(tenantId);
  if (!bot) return;

  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (!adminId) return;

  await bot.telegram.sendMessage(
    adminId,
    `⚠️ *STOK HABIS!*\n\n` +
    `Order #${order.id} telah dibayar tapi stok habis!\n` +
    `Product ID: ${order.product_id}\n` +
    `Variant ID: ${order.variant_id || '-'}\n\n` +
    `Tambah stok segera.`,
    { parse_mode: 'Markdown' }
  );
}

module.exports = { assignStockAndDeliver };