const express = require('express');
const router = express.Router();
const db = require('../../db/pool');

// GET /api/orders/:id — check order status (for bot polling)
router.get('/:id', async (req, res) => {
  try {
    const { rows: [order] } = await db.query(
      `SELECT o.id, o.status, o.amount, o.created_at, o.paid_at,
              p.name AS product_name
       FROM orders o
       JOIN products p ON p.id = o.product_id
       WHERE o.id = $1`,
      [req.params.id]
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

module.exports = router;
