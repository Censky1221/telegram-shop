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
      `SELECT * FROM orders WHERE payment_id=$1 AND status='pending'`, [merchant_ref]);
    if (!order) return res.json({ status: 'not found or processed' });

    const { rows: [tenant] } = await pool.query(
      `SELECT tripay_private_key FROM tenants WHERE id=$1`, [order.tenant_id]);
    if (!tenant?.tripay_private_key) return res.status(400).json({ error: 'No config' });

    // Verifikasi signature
    const received = req.headers['x-callback-signature'];
    const expected = crypto.createHmac('sha256', tenant.tripay_private_key).update(rawBody).digest('hex');
    if (received !== expected) return res.status(400).json({ error: 'Invalid signature' });

    for (let i = 0; i < (order.qty || 1); i++) await assignStockAndDeliver(order, order.tenant_id);
    res.json({ status: 'ok' });

  } catch (err) {
    console.error('Tripay webhook error:', err);
    res.status(500).json({ error: 'Failed' });
  }
});

// ── Pakasir webhook ──────────────────────────────────────────
router.post('/pakasir', express.json(), async (req, res) => {
  try {
    // Log SEMUA field yang dikirim Pakasir — penting untuk debug
    console.log('=== Pakasir webhook received ===');
    console.log('Headers:', JSON.stringify(req.headers));
    console.log('Body:', JSON.stringify(req.body));
    console.log('================================');

    const body = req.body;

    // Ambil order_id — Pakasir bisa pakai field berbeda
    const orderId = body.order_id || body.merchant_ref || body.reference || body.id;

    // Ambil status — bisa pakai field berbeda
    const status  = body.status || body.payment_status || body.transaction_status;

    // Ambil amount
    const amount  = body.amount || body.total_payment || body.received;

    // Ambil project
    const project = body.project || body.project_slug;

    console.log('Pakasir webhook parsed - order_id:', orderId, '| status:', status, '| amount:', amount);

    if (!orderId) {
      console.warn('Pakasir webhook: missing order_id in body');
      return res.json({ status: 'missing order_id' });
    }

    // Status yang dianggap PAID — tambah/kurangi sesuai response Pakasir
    const PAID_STATUSES = ['completed', 'paid', 'success', 'PAID', 'SUCCESS', 'settlement', 'capture'];
    const isPaid = PAID_STATUSES.includes(status);

    if (!isPaid) {
      console.log('Pakasir webhook: status not paid:', status, '— ignored');
      return res.json({ status: 'ignored', received_status: status });
    }

    // Cari order
    const { rows: [order] } = await pool.query(
      `SELECT * FROM orders WHERE payment_id=$1 AND status='pending'`, [orderId]);

    if (!order) {
      console.log('Pakasir webhook: order not found or already processed:', orderId);
      return res.json({ status: 'not found or already processed' });
    }

    // Verifikasi amount jika ada (keamanan dasar)
    if (amount && parseInt(order.amount) !== parseInt(amount)) {
      console.warn('Pakasir webhook: amount mismatch — order:', order.amount, '| webhook:', amount);
      // Tidak reject, hanya log — karena Pakasir kadang kirim total_payment (sudah + fee)
    }

    // Verifikasi project slug
    if (project) {
      const { rows: [tenant] } = await pool.query(
        `SELECT pakasir_project_slug FROM tenants WHERE id=$1`, [order.tenant_id]);
      if (tenant?.pakasir_project_slug && tenant.pakasir_project_slug !== project) {
        console.warn('Pakasir webhook: project mismatch — expected:', tenant.pakasir_project_slug, '| got:', project);
        return res.status(400).json({ error: 'Project mismatch' });
      }
    }

    // Tandai order paid
    await pool.query(
      `UPDATE orders SET status='paid', paid_at=NOW() WHERE id=$1`, [order.id]);

    console.log('Pakasir webhook: order', orderId, 'marked paid — delivering', order.qty, 'item(s)');

    // Hapus pesan QR code jika ada
    if (order.chat_id && order.message_id) {
      try {
        const { getBotByTenantId } = require('../../bot/tenantManager');
        const bot = getBotByTenantId(order.tenant_id);
        if (bot) {
          await bot.telegram.deleteMessage(order.chat_id, order.message_id).catch(() => {});
          // Kirim pesan loading dulu
          await bot.telegram.sendMessage(
            order.chat_id,
            `✅ *Pembayaran Diterima!*

📨 Mengirim produk...`,
            { parse_mode: 'Markdown' }
          );
        }
      } catch (e) {
        console.error('Webhook: gagal hapus pesan QR:', e.message);
      }
    }

    // Kirim produk
    for (let i = 0; i < (order.qty || 1); i++) {
      await assignStockAndDeliver(order, order.tenant_id);
    }

    res.json({ status: 'ok' });

  } catch (err) {
    console.error('Pakasir webhook error:', err);
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;