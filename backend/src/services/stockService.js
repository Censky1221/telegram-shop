const { pool } = require('../db/pool');

async function assignStockAndDeliver(order, tenantId) {
  const tid = tenantId || order.tenant_id;

  const { rows: [info] } = await pool.query(
    `SELECT u.telegram_id,
            p.name AS product_name,
            p.terms AS product_terms,
            pv.name AS variant_name,
            pv.terms AS variant_terms
     FROM users u
     JOIN orders o ON o.user_id = u.id
     JOIN products p ON p.id = o.product_id
     LEFT JOIN product_variants pv ON pv.id = o.variant_id
     WHERE o.id = $1`,
    [order.id]
  );

  if (!info) {
    console.error(`No info found for order #${order.id}`);
    return { success: false, reason: 'no_info' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const stockQuery = order.variant_id
      ? `SELECT id, email, password, content FROM stocks
         WHERE variant_id=$1 AND status='available' AND tenant_id=$2
         ORDER BY id ASC LIMIT 1 FOR UPDATE SKIP LOCKED`
      : `SELECT id, email, password, content FROM stocks
         WHERE product_id=$1 AND variant_id IS NULL AND status='available' AND tenant_id=$2
         ORDER BY id ASC LIMIT 1 FOR UPDATE SKIP LOCKED`;

    const stockParam = order.variant_id
      ? [order.variant_id, tid]
      : [order.product_id, tid];

    const { rows: [stock] } = await client.query(stockQuery, stockParam);

    if (!stock) {
      await client.query('ROLLBACK');
      console.error(`OUT OF STOCK: Order #${order.id}`);
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
    await client.query('COMMIT');

    await deliverCredentials(
      info.telegram_id,
      info.product_name,
      info.variant_name,
      info.variant_terms || info.product_terms,
      stock,
      order.id,
      tid
    );

    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('assignStockAndDeliver error:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function deliverCredentials(telegramId, productName, variantName, termsText, stock, orderId, tenantId) {
  const { getBotByTenantId } = require('../bot/tenantManager');
  const bot = getBotByTenantId(tenantId);
  if (!bot) {
    console.error(`Bot not found for tenant #${tenantId}`);
    return;
  }

  const prodLabel = variantName ? `${productName} - ${variantName}` : productName;
  const terms = termsText ||
    `⚠️ *Penting:*\n• Ganti password setelah login pertama\n• Simpan pesan ini dengan aman\n• Kami tidak dapat mengirim ulang kredensial ini`;

  // Bundle mode: kirim content langsung
  // Normal mode: kirim email + password
  const isiAkun = stock.content
    ? `\`\`\`\n${stock.content}\n\`\`\``
    : `📧 Email   : \`${stock.email}\`\n🔐 Password: \`${stock.password}\``;

  const message =
    `🎉 *Pembayaran Berhasil!*\n\n` +
    `Terima kasih atas pembelian Anda.\n\n` +
    `📦 Produk: *${prodLabel}*\n` +
    `🧾 ID Pesanan: *#${orderId}*\n\n` +
    `─────────────────\n` +
    `${isiAkun}\n` +
    `─────────────────\n\n` +
    `${terms}\n\n` +
    `Terima kasih telah berbelanja! 🙏`;

  await bot.telegram.sendMessage(telegramId, message, { parse_mode: 'Markdown' });
}

async function notifyAdminOutOfStock(order, tenantId) {
  const { getBotByTenantId } = require('../bot/tenantManager');
  const bot = getBotByTenantId(tenantId);
  if (!bot) return;
  const { rows: [t] } = await pool.query(
    `SELECT admin_telegram_id FROM tenants WHERE id=$1`, [tenantId]
  );
  const adminId = t?.admin_telegram_id || process.env.ADMIN_TELEGRAM_ID;
  if (!adminId) return;
  await bot.telegram.sendMessage(
    adminId,
    `⚠️ *STOK HABIS!*\n\nOrder #${order.id} telah dibayar tapi stok habis!\nProduct ID: ${order.product_id}\nVariant ID: ${order.variant_id || '-'}\n\nTambah stok segera.`,
    { parse_mode: 'Markdown' }
  );
}

module.exports = { assignStockAndDeliver };