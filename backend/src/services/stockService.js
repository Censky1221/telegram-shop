const { pool } = require('../db/pool');
const fs = require('fs');
const path = require('path');

async function assignStockAndDeliver(order, tenantId) {
  const tid = tenantId || order.tenant_id;
  const qty = order.qty || 1;

  const { rows: [delivered] } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM stocks WHERE order_id=$1 AND status='sold'`,
    [order.id]
  );

  if (parseInt(delivered.cnt) >= qty) {
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

  if (!info) return { success: false };

  const stockCheckQuery = order.variant_id
    ? `SELECT content FROM stocks WHERE variant_id=$1 AND status='available' AND tenant_id=$2 LIMIT 1`
    : `SELECT content FROM stocks WHERE product_id=$1 AND variant_id IS NULL AND status='available' AND tenant_id=$2 LIMIT 1`;

  const stockCheckParam = order.variant_id
    ? [order.variant_id, tid]
    : [order.product_id, tid];

  const { rows: [firstStock] } = await pool.query(stockCheckQuery, stockCheckParam);

  if (!firstStock) {
    await notifyAdminOutOfStock(order, tid);
    return { success: false };
  }

  const isBundle = !!firstStock.content;

  if (isBundle) {
  const { rows: stocks } = await pool.query(
    order.variant_id
      ? `SELECT id, content FROM stocks 
         WHERE variant_id=$1 AND status='available' AND tenant_id=$2 
         LIMIT $3`
      : `SELECT id, content FROM stocks 
         WHERE product_id=$1 AND variant_id IS NULL AND status='available' AND tenant_id=$2 
         LIMIT $3`,
    [...stockCheckParam, qty]
  );

  if (stocks.length < qty) {
    await notifyAdminOutOfStock(order, tid);
    return { success: false };
  }

  // 🔥 gabung semua content
  const combinedContent = stocks.map((s, i) => {
    return `${i + 1}. ${s.content}`;
  }).join('\n');

  // 🔥 update semua stock jadi sold
  const ids = stocks.map(s => s.id);

  await pool.query(
    `UPDATE stocks SET status='sold', order_id=$1 WHERE id = ANY($2)`,
    [order.id, ids]
  );

  await deliverBundleFile(
    info.telegram_id,
    info.product_name,
    info.variant_name,
    info.variant_terms || info.product_terms,
    combinedContent,
    order.id,
    tid
  );

  await notifyAdminNewOrder(order, tid);
  return { success: true };
}

  // NORMAL MODE
  const stocks = [];

  for (let i = 0; i < qty; i++) {
    const { rows: [stock] } = await pool.query(
      order.variant_id
        ? `SELECT id, email, password FROM stocks WHERE variant_id=$1 AND status='available' AND tenant_id=$2 LIMIT 1`
        : `SELECT id, email, password FROM stocks WHERE product_id=$1 AND variant_id IS NULL AND status='available' AND tenant_id=$2 LIMIT 1`,
      stockCheckParam
    );

    if (!stock) break;

    await pool.query(
      `UPDATE stocks SET status='sold', order_id=$1 WHERE id=$2`,
      [order.id, stock.id]
    );

    stocks.push(stock);
  }

  if (stocks.length === 0) return { success: false };

  await deliverAllCredentials(
    info.telegram_id,
    info.product_name,
    info.variant_name,
    info.variant_terms || info.product_terms,
    stocks,
    order.id,
    tid
  );

  await notifyAdminNewOrder(order, tid);
  return { success: true };
}

// =======================
// 🔥 BUNDLE → FILE TXT
// =======================
async function deliverBundleFile(telegramId, productName, variantName, termsText, content, orderId, tenantId) {
  const { getBotByTenantId } = require('../bot/tenantManager');
  const bot = getBotByTenantId(tenantId);
  if (!bot) return;

  const prodLabel = variantName ? `${productName} - ${variantName}` : productName;
  const safeTerms = termsText ? String(termsText) : 'Tidak ada catatan.';

  const tempDir = path.join(__dirname, '../../temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const filePath = path.join(tempDir, `order_${orderId}.txt`);

  await fs.promises.writeFile(filePath, content);

  const caption =
`🎉 Pembayaran Berhasil!

Terima kasih atas pembelian Anda.

📦 Produk: ${prodLabel}
🧾 ID Pesanan: #${orderId}

─────────────────

${safeTerms}

Terima kasih telah berbelanja! 🙏`;

  try {
    console.log("SEND BUNDLE FILE", orderId);

    await bot.telegram.sendDocument(
  telegramId,
  {
    source: fs.createReadStream(filePath),
    filename: `${productName.replace(/[^a-z0-9]/gi, '_')}_${orderId}.txt`
  },
  {
    caption: caption,
    reply_markup: {
      inline_keyboard: [
        [{ text: '⚠️ Laporkan Masalah', callback_data: `complain_${orderId}` }]
      ]
    }
  }
);

    console.log("SUCCESS SEND BUNDLE");

  } catch (err) {
    console.error("ERROR SEND BUNDLE:", err);
  }

  await fs.promises.unlink(filePath);
}

// =======================
// 🔥 NORMAL → FILE TXT
// =======================
async function deliverAllCredentials(telegramId, productName, variantName, termsText, stocks, orderId, tenantId) {
  const { getBotByTenantId } = require('../bot/tenantManager');
  const bot = getBotByTenantId(tenantId);
  if (!bot) return;

  const prodLabel = variantName ? `${productName} - ${variantName}` : productName;
  const safeTerms = termsText ? String(termsText) : 'Tidak ada catatan.';

  const tempDir = path.join(__dirname, '../../temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const filePath = path.join(tempDir, `order_${orderId}.txt`);

  const akunText = stocks.map((s, i) =>
`AKUN ${i + 1}
Email    : ${s.email}
Password : ${s.password}
`).join('\n');

  await fs.promises.writeFile(filePath, akunText);

  const caption =
`🎉 Pembayaran Berhasil!

Terima kasih atas pembelian Anda.

📦 Produk: ${prodLabel}
🛒 Jumlah: ${stocks.length} akun
🧾 ID Pesanan: #${orderId}

─────────────────

${safeTerms}

Terima kasih telah berbelanja! 🙏`;

  try {
    console.log("SEND FILE START", orderId);

    await bot.telegram.sendDocument(
  telegramId,
  {
    source: fs.createReadStream(filePath),
    filename: `${productName.replace(/[^a-z0-9]/gi, '_')}_${orderId}.txt`
  },
  {
    caption: caption,
    reply_markup: {
      inline_keyboard: [
        [{ text: '⚠️ Laporkan Masalah', callback_data: `complain_${orderId}` }]
      ]
    }
  }
);

    console.log("SEND FILE SUCCESS");

  } catch (err) {
    console.error("SEND FILE ERROR:", err);
  }

  await fs.promises.unlink(filePath);
}

// =======================
// ADMIN
// =======================
async function notifyAdminOutOfStock(order, tenantId) {
  const { getBotByTenantId } = require('../bot/tenantManager');
  const bot = getBotByTenantId(tenantId);
  if (!bot) return;

  const { rows: [t] } = await pool.query(
    `SELECT admin_telegram_id FROM tenants WHERE id=$1`,
    [tenantId]
  );

  if (!t?.admin_telegram_id) return;

  await bot.telegram.sendMessage(
    t.admin_telegram_id,
    `⚠️ STOK HABIS! Order #${order.id}`
  );
}

async function notifyAdminNewOrder(order, tenantId) {
  const { getBotByTenantId } = require('../bot/tenantManager');
  const bot = getBotByTenantId(tenantId);
  if (!bot) return;

  const { rows: [t] } = await pool.query(
    `SELECT admin_telegram_id FROM tenants WHERE id=$1`,
    [tenantId]
  );

  const adminId = t?.admin_telegram_id || process.env.ADMIN_TELEGRAM_ID;
  if (!adminId) return;

  // ambil detail order + user
  const { rows: [info] } = await pool.query(
    `SELECT 
        p.name AS product_name,
        pv.name AS variant_name,
        u.username,
        o.qty,
        o.amount
     FROM orders o
     JOIN products p ON p.id = o.product_id
     LEFT JOIN product_variants pv ON pv.id = o.variant_id
     JOIN users u ON u.id = o.user_id
     WHERE o.id=$1`,
    [order.id]
  );

  if (!info) return;

  const prodLabel = info.variant_name
    ? `${info.product_name} - ${info.variant_name}`
    : info.product_name;

  const userLabel = info.username
    ? `@${info.username}`
    : `ID: ${order.user_id}`;

  const waktu = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta'
  });

  const message =
`🛒 Order Baru!

🧾 ID: #${order.id}
📦 Produk: ${prodLabel}
👤 User: ${userLabel}
🛍 Qty: ${info.qty}
💰 Total: Rp ${Number(info.amount).toLocaleString('id-ID')}
📅 ${waktu} WIB`;

  await bot.telegram.sendMessage(adminId, message);
}

async function replaceAccount(orderId, tenantId) {
  const { getBotByTenantId } = require('../bot/tenantManager');
  const bot = getBotByTenantId(tenantId);
  if (!bot) return;

  // ambil order + user
  const { rows: [order] } = await pool.query(
    `SELECT o.*, u.telegram_id
     FROM orders o
     JOIN users u ON u.id = o.user_id
     WHERE o.id=$1`,
    [orderId]
  );

  if (!order) return;

  // ambil 1 stok baru
  const { rows: [stock] } = await pool.query(
    order.variant_id
      ? `SELECT id, email, password FROM stocks 
         WHERE variant_id=$1 AND status='available' AND tenant_id=$2 LIMIT 1`
      : `SELECT id, email, password FROM stocks 
         WHERE product_id=$1 AND variant_id IS NULL AND status='available' AND tenant_id=$2 LIMIT 1`,
    order.variant_id
      ? [order.variant_id, tenantId]
      : [order.product_id, tenantId]
  );

  if (!stock) {
    await bot.telegram.sendMessage(
      order.telegram_id,
      "❌ Maaf, stok pengganti sedang habis."
    );
    return;
  }

  // tandai stok jadi sold
  await pool.query(
    `UPDATE stocks SET status='sold', order_id=$1 WHERE id=$2`,
    [orderId, stock.id]
  );

  // kirim akun pengganti
  const text =
`🔄 AKUN PENGGANTI

🧾 Order: #${orderId}

Email    : ${stock.email}
Password : ${stock.password}

Silakan dicoba 🙏`;

  await bot.telegram.sendMessage(order.telegram_id, text);

  // notif admin
  const { rows: [tenant] } = await pool.query(
    `SELECT admin_telegram_id FROM tenants WHERE id=$1`,
    [tenantId]
  );

  if (tenant?.admin_telegram_id) {
    await bot.telegram.sendMessage(
      tenant.admin_telegram_id,
      `✅ Replace berhasil untuk Order #${orderId}`
    );
  }
}

module.exports = { 
  assignStockAndDeliver,
  replaceAccount // ✅ TAMBAH INI
};