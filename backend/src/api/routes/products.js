const express = require('express');
const router = express.Router();
const db = require('../../db/pool');

// GET /api/products — public list
router.get('/', async (req, res) => {
  try {
    const tenantId = req.query.tenant_id; // 🔥 ambil tenant

    const { rows } = await db.query(
      `SELECT p.id, p.name, p.description, p.price,
              COUNT(s.id) FILTER (
                WHERE s.status = 'available'
                AND s.tenant_id = $1
              ) AS stock_count
       FROM products p
       LEFT JOIN stocks s 
         ON s.product_id = p.id 
         AND s.tenant_id = $1
       WHERE p.is_active = true
       AND p.tenant_id = $1
       GROUP BY p.id
       ORDER BY p.id`,
      [tenantId]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const tenantId = req.query.tenant_id;

    const { rows: [product] } = await db.query(
      `SELECT p.*, COUNT(s.id) FILTER (
                WHERE s.status = 'available'
                AND s.tenant_id = $2
              ) AS stock_count
       FROM products p
       LEFT JOIN stocks s 
         ON s.product_id = p.id 
         AND s.tenant_id = $2
       WHERE p.id = $1 
       AND p.is_active = true
       AND p.tenant_id = $2
       GROUP BY p.id`,
      [req.params.id, tenantId]
    );

    if (!product) return res.status(404).json({ error: 'Product not found' });

    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

module.exports = router;
