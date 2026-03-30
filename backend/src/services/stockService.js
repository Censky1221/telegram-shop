const { pool } = require('../db/pool');

async function assignStockAndDeliver(order, tenantId) {
  const tid = tenantId || order.tenant_id;
  const qty = order.qty || 1;

  // Ambil info produk/varian + telegram_id user
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

  // Cek tipe stok dari produk/varian ini
  const stockQuery = order.variant_id
    ? `SELECT id, email, password, stock_type, content FROM stocks
       WHERE variant_id=$1 AND status='available' AND tenant_id=$2
       ORDER BY id ASC LIMIT 1 FOR UPDATE SKIP LOCKED`
    : `SELECT id, email, password, stock_type, content FROM stocks
       WHERE product_id=$1 AND variant_id IS NULL AND status='available' AND tenant_id=$2
       ORDER BY id ASC LIMIT 1 FOR UPDATE SKIP LOCKED`;

  const stockParam = order.variant_id
    ? [order.variant_id, tid]
    : [order.product_id, tid];

  // Cek tipe dari stok pertama yang tersedia
  const checkClient = await pool.connect();
  let firstStock;
  try {
    await checkClient.query('BEGIN');
    const { rows: [s] } = await checkClient.query(stockQuery, stockParam);
    await checkClient.query('ROLLBACK'); // hanya cek, tidak lock
    firstStock = s;
  } catch (err) {
    await checkClient.query('ROLLBACK');
    throw err;
  } finally {
    checkClient.release();
  }

  if (!firstStock) {
    await notifyAdminOutOfStock(order, tid);
    return { success: false, reason: 'out_of_stock' };
  }

  const stockType = firstStock.stock_type || 'account';

  // ── TIPE: SERVICE ─────────────────────────────────────────
  // Untuk jasa: tidak assign stok dulu, bot tanya email pembeli
  if (stockType === 'service') {
    return await handleServiceDelivery(order, info, firstStock, tid);
  }

  // ── TIPE: ACCOUNT & COOKIE ────────────────────────────────
  const stocks = [];
  for (let i = 0; i < qty; i++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [stock] } = await client.query(stockQuery, stockParam);

      if (!stock) {
        await client.query('ROLLBACK');
        console.error(`OUT OF STOCK at item ${i+1}: Order #${order.id}`);
        if (i === 0) await notifyAdminOutOfStock(order, tid);
        break;
      }

      await client.query(`UPDATE stocks SET status='sold', order_id=$1 WHERE id=$2`, [order.id, stock.id]);
      await client.query(`UPDATE orders SET status='paid', stock_id=$1, paid_at=NOW() WHERE id=$2`, [stock.id, order.id]);
      await client.query('COMMIT');

      stocks.push(stock);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('assignStockAndDeliver error:', err);
      throw err;
    } finally {
      client.release();
    }
  }

  if (stocks.length === 0) {
    return { success: false, reason: 'out_of_stock' };
  }

  const terms = info.variant_terms || info.product_terms;

  if (stockType === 'cookie') {
    await deliverCookies(info.telegram_id, info.product_name, info.variant_name, terms, stocks, order.id, tid);
  } else {
    await deliverAllCredentials(info.telegram_id, info.product_name, info.variant_name, terms, stocks, order.id, tid);
  }

  return { success: true };
}

// ── Kirim akun (email:password) ───────────────────────────────
async function deliverAllCredentials(telegramId, productName, variantName, termsText, stocks, orderId, tenantId) {
  const { getBotByTenantId } = require('../bot/tenantManager');
  const bot = getBotByTenantId(tenantId);
  if (!bot) { console.error(`Bot not found for tenant #${tenantId}`); return; }

  const prodLabel = variantName ? `${productName} - ${variantName}` : productName;
  const terms     = termsText || `⚠️ *Penting:*\n• Ganti password setelah login pertama\n• Simpan pesan ini dengan aman\n• Kami tidak dapat mengirim ulang kredensial ini`;

  const akunList = stocks.map((s, i) =>
    `*Akun ${stocks.length > 1 ? i + 1 : ''}*\n` +
    `📧 Email   : \`${s.email}\`\n` +
    `🔐 Password: \`${s.password}\``
  ).join('\n─────────────────\n');

  const message =
    `🎉 *Pembayaran Berhasil!*\n\n` +
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

// ── Kirim cookies ─────────────────────────────────────────────
async function deliverCookies(telegramId, productName, variantName, termsText, stocks, orderId, tenantId) {
  const { getBotByTenantId } = require('../bot/tenantManager');
  const bot = getBotByTenantId(tenantId);
  if (!bot) { console.error(`Bot not found for tenant #${tenantId}`); return; }

  const prodLabel = variantName ? `${productName} - ${variantName}` : productName;
  const terms     = termsText || `⚠️ *Penting:*\n• Import cookie menggunakan ekstensi browser\n• Jangan logout dari akun\n• Simpan cookie ini dengan aman`;

  for (let i = 0; i < stocks.length; i++) {
    const s = stocks[i];
    const header = stocks.length > 1
      ? `🍪 *Cookie ${i + 1} dari ${stocks.length}*\n📦 *${prodLabel}*\n🧾 ID: *#${orderId}*\n\n`
      : `🍪 *Cookie ${prodLabel}*\n🧾 ID: *#${orderId}*\n\n`;

    // Kirim header dulu
    await bot.telegram.sendMessage(telegramId,
      `🎉 *Pembayaran Berhasil!*\n\n${header}` +
      `Salin cookie di bawah ini dan import ke browser kamu:\n\n` +
      `${terms}\n\nTerima kasih telah berbelanja! 🙏`,
      { parse_mode: 'Markdown' }
    );

    // Kirim cookie sebagai file .txt agar mudah disalin
    const cookieBuffer = Buffer.from(s.content || '', 'utf-8');
    await bot.telegram.sendDocument(
      telegramId,
      { source: cookieBuffer, filename: `cookie_${prodLabel.replace(/\s+/g, '_')}_${orderId}_${i+1}.txt` },
      { caption: `🍪 Cookie #${i+1} — ${prodLabel}` }
    );
  }
}

// ── Handle jasa: bot tanya email pembeli ──────────────────────
async function handleServiceDelivery(order, info, firstStock, tenantId) {
  const { getBotByTenantId } = require('../bot/tenantManager');
  const bot = getBotByTenantId(tenantId);
  if (!bot) { console.error(`Bot not found for tenant #${tenantId}`); return; }

  const prodLabel = info.variant_name
    ? `${info.product_name} - ${info.variant_name}`
    : info.product_name;

  // Simpan state bahwa user sedang menunggu input email untuk order ini
  // Kita kirim pesan minta email, dengan callback data order_id
  await bot.telegram.sendMessage(
    info.telegram_id,
    `✅ *Pembayaran Berhasil!*\n\n` +
    `📦 Produk: *${prodLabel}*\n` +
    `🧾 ID Pesanan: *#${order.id}*\n\n` +
    `📧 *Masukkan email Gmail kamu* untuk proses jasa:\n\n` +
    `_Contoh: namakamu@gmail.com_\n\n` +
    `⚠️ Pastikan email benar sebelum mengirim!`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        force_reply: true,
        input_field_placeholder: 'namakamu@gmail.com',
      }
    }
  );

  // Simpan di DB bahwa order ini menunggu email
  await pool.query(
    `INSERT INTO service_requests (order_id, user_id, tenant_id, buyer_email, status)
     VALUES ($1, $2, $3, '', 'pending')
     ON CONFLICT DO NOTHING`,
    [order.id, order.user_id, tenantId]
  );

  return { success: true, waiting_email: true };
}

// ── Proses setelah user input email (dipanggil dari botHandlers) ──
async function processServiceEmail(orderId, buyerEmail, tenantId) {
  const { getBotByTenantId } = require('../bot/tenantManager');
  const bot = getBotByTenantId(tenantId);

  const { rows: [order] } = await pool.query(
    `SELECT o.*, u.telegram_id, p.name AS product_name, pv.name AS variant_name,
            p.terms AS product_terms, pv.terms AS variant_terms
     FROM orders o
     JOIN users u ON u.id = o.user_id
     JOIN products p ON p.id = o.product_id
     LEFT JOIN product_variants pv ON pv.id = o.variant_id
     WHERE o.id = $1 AND o.tenant_id = $2`,
    [orderId, tenantId]
  );

  if (!order) return;

  // Update service_request dengan email pembeli
  await pool.query(
    `UPDATE service_requests SET buyer_email=$1, status='processing' WHERE order_id=$2`,
    [buyerEmail, orderId]
  );

  // Tandai stok sebagai sold
  const stockQuery = order.variant_id
    ? `SELECT id, content FROM stocks WHERE variant_id=$1 AND status='available' AND tenant_id=$2 ORDER BY id ASC LIMIT 1`
    : `SELECT id, content FROM stocks WHERE product_id=$1 AND variant_id IS NULL AND status='available' AND tenant_id=$2 ORDER BY id ASC LIMIT 1`;
  const stockParam = order.variant_id ? [order.variant_id, tenantId] : [order.product_id, tenantId];
  const { rows: [stock] } = await pool.query(stockQuery, stockParam);

  if (stock) {
    await pool.query(`UPDATE stocks SET status='sold', order_id=$1 WHERE id=$2`, [orderId, stock.id]);
    await pool.query(`UPDATE orders SET stock_id=$1 WHERE id=$2`, [stock.id, orderId]);
  }

  const prodLabel = order.variant_name
    ? `${order.product_name} - ${order.variant_name}`
    : order.product_name;

  // Kirim konfirmasi ke user
  await bot.telegram.sendMessage(
    order.telegram_id,
    `✅ *Email diterima!*\n\n` +
    `📧 Email: \`${buyerEmail}\`\n` +
    `📦 Produk: *${prodLabel}*\n\n` +
    `⏳ Admin sedang memproses pesanan kamu.\n` +
    `Kamu akan mendapat notifikasi setelah selesai.\n\n` +
    `🧾 ID Pesanan: *#${orderId}*`,
    { parse_mode: 'Markdown' }
  );

  // Notif admin dengan email pembeli
  const { rows: [t] } = await pool.query(`SELECT admin_telegram_id FROM tenants WHERE id=$1`, [tenantId]);
  if (t?.admin_telegram_id) {
    const instructions = stock?.content ? `\n\n📋 *Instruksi:*\n${stock.content}` : '';
    await bot.telegram.sendMessage(
      t.admin_telegram_id,
      `🛎 *Request Jasa Baru!*\n\n` +
      `🧾 Order ID: *#${orderId}*\n` +
      `📦 Produk: *${prodLabel}*\n` +
      `📧 Email Pembeli: \`${buyerEmail}\`\n` +
      `💰 Total: *Rp ${Number(order.amount).toLocaleString('id-ID')}*\n` +
      `📅 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB` +
      instructions,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Tandai Selesai', callback_data: `service_done_${orderId}_${order.telegram_id}` }
          ]]
        }
      }
    );
  }
}

async function notifyAdminOutOfStock(order, tenantId) {
  const { getBotByTenantId } = require('../bot/tenantManager');
  const bot = getBotByTenantId(tenantId);
  if (!bot) return;
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (!adminId) return;
  await bot.telegram.sendMessage(
    adminId,
    `⚠️ *STOK HABIS!*\n\nOrder #${order.id} telah dibayar tapi stok habis!\nProduct ID: ${order.product_id}\nVariant ID: ${order.variant_id || '-'}\n\nTambah stok segera.`,
    { parse_mode: 'Markdown' }
  );
}

module.exports = { assignStockAndDeliver, processServiceEmail };