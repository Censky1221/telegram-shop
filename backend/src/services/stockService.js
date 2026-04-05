const { pool } = require('../db/pool');

async function assignStockAndDeliver(order, tenantId) {
  const tid = tenantId || order.tenant_id;
  const qty = order.qty || 1;

  // Cek apakah order sudah pernah di-deliver (anti double deliver)
  const { rows: [delivered] } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM stocks WHERE order_id=$1 AND status='sold'`,
    [order.id]
  );
  if (parseInt(delivered.cnt) >= qty) {
    console.log(`assignStockAndDeliver: order #${order.id} already delivered (${delivered.cnt} stocks), skipping`);
    return { success: true, reason: 'already_delivered' };
  }

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

  // Cek apakah stok pertama yang tersedia adalah bundle (punya content)?
  const stockCheckQuery = order.variant_id
    ? `SELECT content FROM stocks
       WHERE variant_id=$1 AND status='available' AND tenant_id=$2
       ORDER BY id ASC LIMIT 1`
    : `SELECT content FROM stocks
       WHERE product_id=$1 AND variant_id IS NULL AND status='available' AND tenant_id=$2
       ORDER BY id ASC LIMIT 1`;

  const stockCheckParam = order.variant_id
    ? [order.variant_id, tid]
    : [order.product_id, tid];

  const { rows: [firstStock] } = await pool.query(stockCheckQuery, stockCheckParam);

  if (!firstStock) {
    console.error(`OUT OF STOCK: Order #${order.id}`);
    await notifyAdminOutOfStock(order, tid);
    return { success: false, reason: 'out_of_stock' };
  }

  const isBundle = !!firstStock.content;

  if (isBundle) {
    // ── Mode Bundle: ambil 1 row, kirim content langsung ──────────
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const stockQuery = order.variant_id
        ? `SELECT id, content FROM stocks
           WHERE variant_id=$1 AND status='available' AND tenant_id=$2
           ORDER BY id ASC LIMIT 1 FOR UPDATE SKIP LOCKED`
        : `SELECT id, content FROM stocks
           WHERE product_id=$1 AND variant_id IS NULL AND status='available' AND tenant_id=$2
           ORDER BY id ASC LIMIT 1 FOR UPDATE SKIP LOCKED`;

      const { rows: [stock] } = await client.query(stockQuery, stockCheckParam);

      if (!stock) {
        await client.query('ROLLBACK');
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

      await deliverBundle(
        info.telegram_id,
        info.product_name,
        info.variant_name,
        info.variant_terms || info.product_terms,
        stock.content,
        order.id,
        tid
      );

      return { success: true };
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('assignStockAndDeliver bundle error:', err);
      throw err;
    } finally {
      client.release();
    }

  } else {
    // ── Mode Normal: ambil sejumlah qty, kirim semua akun ─────────
    const stocks = [];

    for (let i = 0; i < qty; i++) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const stockQuery = order.variant_id
          ? `SELECT id, email, password FROM stocks
             WHERE variant_id=$1 AND status='available' AND tenant_id=$2
             ORDER BY id ASC LIMIT 1 FOR UPDATE SKIP LOCKED`
          : `SELECT id, email, password FROM stocks
             WHERE product_id=$1 AND variant_id IS NULL AND status='available' AND tenant_id=$2
             ORDER BY id ASC LIMIT 1 FOR UPDATE SKIP LOCKED`;

        const { rows: [stock] } = await client.query(stockQuery, stockCheckParam);

        if (!stock) {
          await client.query('ROLLBACK');
          console.error(`OUT OF STOCK at item ${i + 1}: Order #${order.id}`);
          if (i === 0) await notifyAdminOutOfStock(order, tid);
          break;
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

        stocks.push(stock);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('assignStockAndDeliver normal error:', err);
        throw err;
      } finally {
        client.release();
      }
    }

    if (stocks.length === 0) {
      return { success: false, reason: 'out_of_stock' };
    }

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
  }
}

// Kirim bundle (1 stok berisi banyak akun dalam 1 teks)
async function deliverBundle(telegramId, productName, variantName, termsText, content, orderId, tenantId) {
  const { getBotByTenantId } = require('../bot/tenantManager');
  const bot = getBotByTenantId(tenantId);
  if (!bot) {
    console.error(`Bot not found for tenant #${tenantId}`);
    return;
  }

  const prodLabel = variantName ? `${productName} - ${variantName}` : productName;
  const terms = termsText ||
    `⚠️ *Penting:*\n• Ganti password setelah login pertama\n• Simpan pesan ini dengan aman\n• Kami tidak dapat mengirim ulang kredensial ini`;

  const message =
    `🎉 *Pembayaran Berhasil!*\n\n` +
    `Terima kasih atas pembelian Anda.\n\n` +
    `📦 Produk: *${prodLabel}*\n` +
    `🧾 ID Pesanan: *#${orderId}*\n\n` +
    `─────────────────\n` +
    `\`\`\`\n${content}\n\`\`\`\n` +
    `─────────────────\n\n` +
    `${terms}\n\n` +
    `Terima kasih telah berbelanja! 🙏`;

  await bot.telegram.sendMessage(telegramId, message, { parse_mode: 'Markdown' });
}

// Kirim normal (beberapa akun email:password)
async function deliverAllCredentials(telegramId, productName, variantName, termsText, stocks, orderId, tenantId) {
  const { getBotByTenantId } = require('../bot/tenantManager');
  const bot = getBotByTenantId(tenantId);
  if (!bot) {
    console.error(`Bot not found for tenant #${tenantId}`);
    return;
  }

  const prodLabel = variantName ? `${productName} - ${variantName}` : productName;
  const terms = termsText ||
    `⚠️ *Penting:*\n• Ganti password setelah login pertama\n• Simpan pesan ini dengan aman\n• Kami tidak dapat mengirim ulang kredensial ini`;

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