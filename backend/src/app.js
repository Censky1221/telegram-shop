require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const { loadAllTenants, stopAllBots } = require('./bot/tenantManager');
const productsRouter = require('./api/routes/products');
const ordersRouter   = require('./api/routes/orders');
const webhookRouter  = require('./api/routes/webhook');
const adminRouter    = require('./api/routes/admin');
const tenantRouter   = require('./api/routes/tenant');
const superRouter    = require('./api/routes/super');
const webRouter      = require('./api/routes/web');
const { autoExpireWebOrders } = require('./api/routes/web');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use('/api/webhook', webhookRouter);
app.use(express.json());

// ── Serve Webstore (static) ─────────────────────────────────
// Folder webstore ada di dalam backend/ (ikut ter-deploy ke Railway)
const webstoreDir = path.join(__dirname, '../webstore');
app.use(express.static(webstoreDir));
// Fallback: GET / → index.html
app.get('/', (_, res) => res.sendFile(path.join(webstoreDir, 'index.html')));

// ── Routes ──────────────────────────────────────────────────
app.use('/api/products', productsRouter);
app.use('/api/orders',   ordersRouter);
app.use('/api/admin',    adminRouter);
app.use('/api/tenant',   tenantRouter);
app.use('/api/super',    superRouter);
app.use('/api/web',      webRouter);

app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date() }));

// ── Auto expire orders pending > 15 menit ─────────────────
const { pool } = require('./db/pool');
const { getBotByTenantId } = require('./bot/tenantManager');

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
        // Notif user via bot
        const { rows: [user] } = await pool.query(
          `SELECT telegram_id FROM users WHERE id=$1`, [order.user_id]
        );
        if (!user) continue;
        const bot = getBotByTenantId(order.tenant_id);
        if (!bot) continue;
        await bot.telegram.sendMessage(
          user.telegram_id,
          `⏰ *Pesanan Expired!*\n\n🧾 Order #${order.id} telah dibatalkan otomatis karena tidak dibayar dalam 5 menit.\n\nSilakan buat pesanan baru jika masih ingin membeli.`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) { console.warn(`Notify expired order #${order.id} failed:`, e.message); }
    }

    if (expiredOrders.length > 0) {
      console.log(`⏰ Auto expired ${expiredOrders.length} order(s)`);
    }
    // Juga expire web orders
    await autoExpireWebOrders();
  } catch (err) {
    console.error('Auto expire error:', err.message);
  }
}, 60 * 1000); // cek setiap 1 menit

// ── Fungsi notif order masuk ke admin ────────────────────
const notifyAdminNewOrder = async (tenantId, order, productName, variantName, username, qty, total) => {
  try {
    const { getBotByTenantId } = require('./bot/tenantManager');
    const bot = getBotByTenantId(tenantId);
    if (!bot) return;

    const { rows: [tenant] } = await pool.query(
      `SELECT admin_telegram_id FROM tenants WHERE id=$1`, [tenantId]
    );
    if (!tenant?.admin_telegram_id) return;

    const prodLabel = variantName ? `${productName} - ${variantName}` : productName;
    const userLabel = username ? `@${username}` : `#${order.user_id}`;

    await bot.telegram.sendMessage(
      tenant.admin_telegram_id,
      `🛒 *Order Baru Masuk!*\n\n` +
      `🧾 ID: *#${order.id}*\n` +
      `📦 Produk: *${prodLabel}*\n` +
      `👤 User: ${userLabel}\n` +
      `🛍 Qty: *${qty}*\n` +
      `💰 Total: *Rp ${Number(total).toLocaleString('id-ID')}*\n` +
      `📅 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) { console.warn('notif admin error:', err.message); }
};

module.exports.notifyAdminNewOrder = notifyAdminNewOrder;

// ── Start ───────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`API running on http://localhost:${PORT}`);

  // Auto-migrate tabel web_orders jika belum ada
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS web_orders (
        id              SERIAL PRIMARY KEY,
        tenant_id       INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        product_id      INTEGER REFERENCES products(id),
        variant_id      INTEGER,
        buyer_email     VARCHAR(300) NOT NULL,
        buyer_name      VARCHAR(200),
        qty             INTEGER DEFAULT 1,
        amount          INTEGER NOT NULL,
        payment_id      VARCHAR(200) UNIQUE,
        payment_url     TEXT,
        payment_gateway VARCHAR(50) DEFAULT 'tripay',
        status          VARCHAR(20) DEFAULT 'pending'
                        CHECK (status IN ('pending','paid','failed','expired')),
        delivered       BOOLEAN DEFAULT false,
        delivery_content TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        paid_at         TIMESTAMPTZ,
        expired_at      TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_web_orders_tenant  ON web_orders(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_web_orders_payment ON web_orders(payment_id);
      CREATE INDEX IF NOT EXISTS idx_web_orders_email   ON web_orders(buyer_email);
      CREATE INDEX IF NOT EXISTS idx_web_orders_status  ON web_orders(status);
    `);
    console.log('✅ web_orders table ready');
  } catch (err) {
    console.error('web_orders migration error:', err.message);
  }

  await loadAllTenants();
});

process.once('SIGINT',  () => { stopAllBots(); process.exit(0); });
process.once('SIGTERM', () => { stopAllBots(); process.exit(0); });