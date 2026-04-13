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
    const { rows: [stock] } = await pool.query(
      `SELECT id, content FROM stocks WHERE variant_id=$1 AND status='available' AND tenant_id=$2 LIMIT 1`,
      stockCheckParam
    );

    await pool.query(
      `UPDATE stocks SET status='sold', order_id=$1 WHERE id=$2`,
      [order.id, stock.id]
    );

    await deliverBundleFile(
      info.telegram_id,
      info.product_name,
      info.variant_name,
      info.variant_terms || info.product_terms,
      stock.content,
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
      { source: fs.createReadStream(filePath) },
      { caption: caption }
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
      { source: fs.createReadStream(filePath) },
      { caption: caption }
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

  if (!t?.admin_telegram_id) return;

  await bot.telegram.sendMessage(
    t.admin_telegram_id,
    `🛒 Order Baru #${order.id}`
  );
}

module.exports = { assignStockAndDeliver };