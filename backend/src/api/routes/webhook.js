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
    console.log('=== Pakasir webhook received ===');
    console.log('Headers:', JSON.stringify(req.headers));
    console.log('Body:', JSON.stringify(req.body));
    console.log('================================');

    const body = req.body;

    // Ambil order_id dari berbagai kemungkinan field yang dikirim Pakasir
    const orderId = body.order_id || body.merchant_ref || body.reference || body.id || body.payment_id;

    // Ambil status
    const status = body.status || body.payment_status || body.transaction_status || body.payment_state;

    // Ambil amount
    const amount = body.amount || body.total_payment || body.received || body.final_amount;

    console.log('Pakasir webhook parsed - order_id:', orderId, '| status:', status, '| amount:', amount);

    if (!orderId) {
      console.warn('Pakasir webhook: missing order_id in body');
      return res.json({ status: 'missing order_id' });
    }

    // Status yang dianggap sebagai berhasil bayar
    const PAID_STATUSES = ['completed', 'paid', 'success', 'PAID', 'SUCCESS', 'settlement', 'capture', 'succeeded'];
    const isPaid = PAID_STATUSES.includes(String(status).toLowerCase());

    if (!isPaid) {
      console.log('Pakasir webhook: status not paid → ignored');
      return res.json({ status: 'ignored', received_status: status });
    }

    // PERBAIKAN UTAMA: Cari order dengan payment_id ATAU external_order_id
    const { rows: [order] } = await pool.query(`
      SELECT * FROM orders 
      WHERE (payment_id = $1 OR external_order_id = $1) 
        AND status = 'pending'
      LIMIT 1
    `, [orderId]);

    if (!order) {
      console.log('Pakasir webhook: order not found or already processed:', orderId);
      return res.json({ status: 'not found or already processed', order_id: orderId });
    }

    console.log(`Pakasir webhook: order ${orderId} found (ID: ${order.id}) → marking as paid`);

    // Update status menjadi paid
    await pool.query(
      `UPDATE orders SET status='paid', paid_at=NOW() WHERE id=$1`, 
      [order.id]
    );

    console.log('Pakasir webhook: order', orderId, 'marked paid — delivering', order.qty || 1, 'item(s)');

    // Hapus pesan QRIS lama jika ada
    if (order.chat_id && order.message_id) {
      try {
        const { getBotByTenantId } = require('../../bot/tenantManager');
        const bot = getBotByTenantId(order.tenant_id);
        if (bot) {
          await bot.telegram.deleteMessage(order.chat_id, order.message_id).catch(() => {});
        }
      } catch (e) {
        console.error('Webhook: gagal hapus pesan QRIS:', e.message);
      }
    }

    // Kirim stok / akun ke user
    const { assignStockAndDeliver } = require('../../services/stockService');
    for (let i = 0; i < (order.qty || 1); i++) {
      await assignStockAndDeliver(order, order.tenant_id);
    }

    console.log(`✅ Pakasir webhook success: order ${order.id} processed`);

    res.json({ status: 'ok' });

  } catch (err) {
    console.error('Pakasir webhook error:', err);
    res.status(500).json({ error: 'Failed', message: err.message });
  }
});

module.exports = router;