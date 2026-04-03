require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Import Router ───────────────────────────────────────────
const { loadAllTenants, stopAllBots, getBotByTenantId } = require('./bot/tenantManager');
const productsRouter = require('./api/routes/products');
const ordersRouter   = require('./api/routes/orders');
const webhookRouter  = require('./api/routes/webhook');
const adminRouter    = require('./api/routes/admin');
const tenantRouter   = require('./api/routes/tenant');
const superRouter    = require('./api/routes/super');
const monitorRouter  = require('./api/routes/monitor');

// ── Database ────────────────────────────────────────────────
const { pool } = require('./db/pool');

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// webhook harus di atas (biar raw body aman kalau nanti dipakai)
app.use('/api/webhook', webhookRouter);

// ── Routes ──────────────────────────────────────────────────
app.use('/api/products', productsRouter);
app.use('/api/orders',   ordersRouter);
app.use('/api/admin',    adminRouter);
app.use('/api/tenant',   tenantRouter);
app.use('/api/super',    superRouter);

// ✅ MONITOR ROUTE (INI YANG DIPAKE DASHBOARD)
app.use('/monitor', monitorRouter);

// health check
app.get('/health', (_, res) => {
  res.json({ status: 'ok', ts: new Date() });
});

// ── AUTO EXPIRE ORDER ───────────────────────────────────────
setInterval(async () => {
  try {
    const { rows: expiredOrders } = await pool.query(
      `UPDATE orders SET status='expired'
       WHERE status='pending'
         AND created_at < NOW() - INTERVAL '5 minutes'
       RETURNING id, user_id, tenant_id, amount`
    );

    for (const order of expiredOrders) {
      try {
        const { rows: [user] } = await pool.query(
          `SELECT telegram_id FROM users WHERE id=$1`,
          [order.user_id]
        );

        if (!user) continue;

        const bot = getBotByTenantId(order.tenant_id);
        if (!bot) continue;

        await bot.telegram.sendMessage(
          user.telegram_id,
          `⏰ *Pesanan Expired!*\n\n` +
          `🧾 Order #${order.id} telah dibatalkan otomatis karena tidak dibayar dalam 5 menit.\n\n` +
          `Silakan buat pesanan baru jika masih ingin membeli.`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {
        console.warn(`Notify expired order #${order.id} failed:`, e.message);
      }
    }

    if (expiredOrders.length > 0) {
      console.log(`⏰ Auto expired ${expiredOrders.length} order(s)`);
    }
  } catch (err) {
    console.error('Auto expire error:', err.message);
  }
}, 60 * 1000);

// ── NOTIF ADMIN ORDER BARU ─────────────────────────────────
const notifyAdminNewOrder = async (
  tenantId,
  order,
  productName,
  variantName,
  username,
  qty,
  total
) => {
  try {
    const bot = getBotByTenantId(tenantId);
    if (!bot) return;

    const { rows: [tenant] } = await pool.query(
      `SELECT admin_telegram_id FROM tenants WHERE id=$1`,
      [tenantId]
    );

    if (!tenant?.admin_telegram_id) return;

    const prodLabel = variantName
      ? `${productName} - ${variantName}`
      : productName;

    const userLabel = username
      ? `@${username}`
      : `#${order.user_id}`;

    await bot.telegram.sendMessage(
      tenant.admin_telegram_id,
      `🛒 *Order Baru Masuk!*\n\n` +
      `🧾 ID: *#${order.id}*\n` +
      `📦 Produk: *${prodLabel}*\n` +
      `👤 User: ${userLabel}\n` +
      `🛍 Qty: *${qty}*\n` +
      `💰 Total: *Rp ${Number(total).toLocaleString('id-ID')}*\n` +
      `📅 ${new Date().toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta'
      })} WIB`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.warn('notif admin error:', err.message);
  }
};

module.exports.notifyAdminNewOrder = notifyAdminNewOrder;

// ── START SERVER ───────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`🚀 API running on http://localhost:${PORT}`);
  await loadAllTenants();
});

// ── GRACEFUL SHUTDOWN ──────────────────────────────────────
process.once('SIGINT', () => {
  stopAllBots();
  process.exit(0);
});

process.once('SIGTERM', () => {
  stopAllBots();
  process.exit(0);
});