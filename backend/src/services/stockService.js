const { pool } = require('../db/pool');

// Ambil semua stok untuk 1 order sekaligus (qty > 1 = 1 pesan)
async function assignStockAndDeliver(order, tenantId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 🔥 LOCK ORDER (ANTI DOUBLE)
    const { rows: [locked] } = await client.query(
      `SELECT * FROM orders WHERE id=$1 FOR UPDATE`,
      [order.id]
    );

    if (!locked) {
      await client.query('ROLLBACK');
      return { success: false };
    }

    // ❌ kalau sudah diproses → STOP
    if (locked.status === 'paid') {
      console.log(`Order #${order.id} already processed`);
      await client.query('ROLLBACK');
      return { success: true };
    }

    const tid = tenantId || order.tenant_id;
    const qty = order.qty || 1;

    // Ambil info produk/varian sekali
    const { rows: [info] } = await client.query(
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
      await client.query('ROLLBACK');
      console.error(`No info found for order #${order.id}`);
      return { success: false, reason: 'no_info' };
    }

    const stocks = [];

    // 🔁 Ambil stok sesuai qty
    for (let i = 0; i < qty; i++) {
      const stockQuery = order.variant_id
        ? `SELECT id, email, password FROM stocks
           WHERE variant_id=$1 AND status='available' AND tenant_id=$2
           ORDER BY id ASC LIMIT 1 FOR UPDATE SKIP LOCKED`
        : `SELECT id, email, password FROM stocks
           WHERE product_id=$1 AND variant_id IS NULL AND status='available' AND tenant_id=$2
           ORDER BY id ASC LIMIT 1 FOR UPDATE SKIP LOCKED`;

      const stockParam = order.variant_id
        ? [order.variant_id, tid]
        : [order.product_id, tid];

      const { rows: [stock] } = await client.query(stockQuery, stockParam);

      if (!stock) {
        console.error(`OUT OF STOCK at item ${i + 1}: Order #${order.id}`);
        if (i === 0) await notifyAdminOutOfStock(order, tid);
        break;
      }

      // Update stok jadi sold
      await client.query(
        `UPDATE stocks SET status='sold', order_id=$1 WHERE id=$2`,
        [order.id, stock.id]
      );

      stocks.push(stock);
    }

    if (stocks.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'out_of_stock' };
    }

    // ✅ update order sekali saja
    await client.query(
      `UPDATE orders SET status='paid', paid_at=NOW() WHERE id=$1`,
      [order.id]
    );

    await client.query('COMMIT');

    // 🚀 Kirim akun setelah transaksi selesai
    await deliverAllCredentials(
      info.telegram_id,
      info.product_name,
      info.variant_name,
      info.variant_terms || info.product_terms,
      stocks,
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

// 🔽 Kirim semua akun dalam 1 pesan
async function deliverAllCredentials(telegramId, productName, variantName, termsText, stocks, orderId, tenantId) {
  const { getBotByTenantId } = require('../bot/tenantManager');
  const bot = getBotByTenantId(tenantId);

  if (!bot) {
    console.error(`Bot not found for tenant #${tenantId}`);
    return;
  }

  const prodLabel = variantName
    ? `${productName} - ${variantName}`
    : productName;

  const terms = termsText || `⚠️ *Penting:*
• Ganti password setelah login pertama
• Simpan pesan ini dengan aman
• Kami tidak dapat mengirim ulang kredensial ini`;

  const akunList = stocks.map((s, i) =>
    `*Akun ${stocks.length > 1 ? i + 1 : ''}*\n` +
    `📧 Email   : \`${s.email}\`\n` +
    `🔐 Password: \`${s.password}\``
  ).join('\n─────────────────\n');

  const message =
    `🎉 *Pembayaran Berhasil!*\n\n` +
    `Terima kasih atas pembelian Anda.\n\n` +
    `📦 Produk: *${prodLabel}*\n` +
    `🛒 Jumlah: *${stocks.length} akun*\n` +
    `🧾 ID Pesanan: *#${orderId}*\n\n` +
    `─────────────────\n` +
    `${akunList}\n` +
    `─────────────────\n\n` +
    `${terms}\n\n` +
    `Terima kasih telah berbelanja! 🙏`;

  await bot.telegram.sendMessage(telegramId, message, {
    parse_mode: 'Markdown'
  });
}

// 🔔 Notif admin kalau stok habis
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