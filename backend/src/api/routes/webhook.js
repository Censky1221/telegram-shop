const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const db      = require('../../db/pool');
const { assignStockAndDeliver } = require('../../services/stockService');

// Tripay callback/webhook
router.post('/tripay', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const rawBody  = req.body.toString();
    const payload  = JSON.parse(rawBody);

    // Verifikasi signature dari Tripay
    const signature = req.headers['x-callback-signature'];
    const expected  = crypto
      .createHmac('sha256', process.env.TRIPAY_PRIVATE_KEY)
      .update(rawBody)
      .digest('hex');

    if (signature !== expected) {
      console.warn('Tripay webhook: invalid signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const { merchant_ref, status } = payload;

    // Hanya proses jika status PAID
    if (status !== 'PAID') {
      return res.json({ status: 'ignored', reason: `status is ${status}` });
    }

    // Cari order berdasarkan merchant_ref (= orderId kita)
    const { rows: [order] } = await db.query(
      `SELECT * FROM orders WHERE payment_id=$1 AND status='pending'`,
      [merchant_ref]
    );

    if (!order) {
      return res.json({ status: 'order not found or already processed' });
    }

    // Kirim stok ke user
    for (let i = 0; i < (order.qty || 1); i++) {
      await assignStockAndDeliver(order);
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Tripay webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;