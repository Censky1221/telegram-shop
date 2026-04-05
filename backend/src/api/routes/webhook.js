const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const { pool } = require('../../db/pool');
const { assignStockAndDeliver } = require('../../services/stockService');

// ── Tripay webhook ───────────────────────────────────────────
router.post('/tripay', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const rawBody = req.body.toString('utf8');
    const payload = JSON.parse(rawBody);
    const { merchant_ref, status } = payload;

    console.log('Tripay webhook:', merchant_ref, status);
    if (status !== 'PAID') return res.json({ status: 'ignored' });

    const { rows: [order] } = await pool.query(
      `UPDATE orders SET status='paid', paid_at=NOW()
       WHERE payment_id=$1 AND status='pending'
       RETURNING *`, [merchant_ref]);
    if (!order) return res.json({ status: 'not found or processed' });

    const { rows: [tenant] } = await pool.query(
      `SELECT tripay_private_key FROM tenants WHERE id=$1`, [order.tenant_id]);
    if (!tenant?.tripay_private_key) return res.status(400).json({ error: 'No config' });

    const received = req.headers['x-callback-signature'];
    const expected = crypto.createHmac('sha256', tenant.tripay_private_key).update(rawBody).digest('hex');
    if (received !== expected) return res.status(400).json({ error: 'Invalid signature' });

    // Cukup 1x — stockService sudah handle qty di dalamnya
    await assignStockAndDeliver(order, order.tenant_id);
    res.json({ status: 'ok' });

  } catch (err) {
    console.error('Tripay webhook error:', err);
    res.status(500).json({ error: 'Failed' });
  }
});

// ── Pakasir webhook ──────────────────────────────────────────
router.post('/pakasir', express.json(), async (req, res) => {
  // Langsung reply 200 agar Pakasir tidak retry
  res.json({ status: 'received' });

  try {
    const body    = req.body;
    const orderId = body.order_id || body.merchant_ref || body.reference || body.id;
    const status  = body.status   || body.payment_status || body.transaction_status;
    const project = body.project  || body.project_slug;

    console.log('Pakasir webhook - order_id:', orderId, '| status:', status);

    if (!orderId) return console.warn('Pakasir webhook: missing order_id');

    const PAID_STATUSES = ['completed', 'paid', 'success', 'PAID', 'SUCCESS', 'settlement', 'capture'];
    if (!PAID_STATUSES.includes(status)) {
      return console.log('Pakasir webhook: status not paid:', status, '— ignored');
    }

    // ── IDEMPOTENCY CHECK ─────────────────────────────────────
    // INSERT ke tabel idempotency — jika sudah ada, skip (PRIMARY KEY constraint)
    try {
      const { rowCount } = await pool.query(
        `INSERT INTO webhook_processed (payment_id) VALUES ($1)
         ON CONFLICT (payment_id) DO NOTHING`,
        [orderId]
      );
      if (rowCount === 0) {
        console.log('Pakasir webhook: DUPLICATE — skipping:', orderId);
        return;
      }
    } catch (err) {
      console.error('Pakasir webhook: idempotency error:', err.message);
      return;
    }

    // ── UPDATE ORDER ──────────────────────────────────────────
    const { rows: [order] } = await pool.query(
      `UPDATE orders SET status='paid', paid_at=NOW()
       WHERE payment_id=$1 AND status='pending'
       RETURNING *`, [orderId]
    );

    if (!order) {
      console.log('Pakasir webhook: order not found or already paid:', orderId);
      return;
    }

    console.log('Pakasir webhook: order', orderId, '(#' + order.id + ') marked paid — delivering qty:', order.qty);

    // ── HAPUS PESAN QR ────────────────────────────────────────
    if (order.chat_id && order.message_id) {
      try {
        const { getBotByTenantId } = require('../../bot/tenantManager');
        const bot = getBotByTenantId(order.tenant_id);
        if (bot) {
          await bot.telegram.deleteMessage(order.chat_id, order.message_id).catch(() => {});
          await bot.telegram.sendMessage(
            order.chat_id,
            `✅ *Pembayaran Diterima!*\n\n📨 Mengirim produk...`,
            { parse_mode: 'Markdown' }
          );
        }
      } catch (e) {
        console.error('Webhook: gagal hapus pesan QR:', e.message);
      }
    }

    // ── KIRIM PRODUK — cukup 1x, stockService handle qty ─────
    await assignStockAndDeliver(order, order.tenant_id);

    // ── NOTIF ADMIN ───────────────────────────────────────────
    try {
      const { getBotByTenantId } = require('../../bot/tenantManager');
      const bot = getBotByTenantId(order.tenant_id);
      if (bot) {
        const { rows: [t] } = await pool.query(
          `SELECT admin_telegram_id FROM tenants WHERE id=$1`, [order.tenant_id]);
        if (t?.admin_telegram_id) {
          const { rows: [info] } = await pool.query(
            `SELECT p.name AS product_name, pv.name AS variant_name, u.username
             FROM orders o
             JOIN products p ON p.id=o.product_id
             LEFT JOIN product_variants pv ON pv.id=o.variant_id
             JOIN users u ON u.id=o.user_id
             WHERE o.id=$1`, [order.id]);
          if (info) {
            const prodLabel = info.variant_name
              ? `${info.product_name} - ${info.variant_name}`
              : info.product_name;
            const userLabel = info.username ? `@${info.username}` : `ID: ${order.user_id}`;
            await bot.telegram.sendMessage(
              t.admin_telegram_id,
              `🛒 *Order Baru!*\n\n` +
              `🧾 ID: *#${order.id}*\n` +
              `📦 Produk: *${prodLabel}*\n` +
              `👤 User: ${userLabel}\n` +
              `🛍 Qty: *${order.qty}*\n` +
              `💰 Total: *Rp ${Number(order.amount).toLocaleString('id-ID')}*\n` +
              `📅 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`,
              { parse_mode: 'Markdown' }
            );
          }
        }
      }
    } catch (e) {
      console.warn('Webhook: notif admin error:', e.message);
    }

  } catch (err) {
    console.error('Pakasir webhook error:', err);
  }
});

module.exports = router;