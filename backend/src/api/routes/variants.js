const express  = require('express');
const router   = express.Router();
const { pool } = require('../../db/pool');

// GET /api/admin/variants?productId=xxx
router.get('/variants', async (req, res) => {
  const { productId } = req.query;
  const tenantId      = req.admin.tenant_id;
  if (!productId) return res.status(400).json({ error: 'productId required' });
  try {
    const { rows } = await pool.query(
      `SELECT pv.*,
              COUNT(s.id) FILTER (WHERE s.status='available') AS stock_count
       FROM product_variants pv
       LEFT JOIN stocks s ON s.variant_id = pv.id
       WHERE pv.product_id=$1 AND pv.tenant_id=$2
       GROUP BY pv.id
       ORDER BY pv.id`,
      [productId, tenantId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/variants
router.post('/variants', async (req, res) => {
  const { product_id, name, description, price } = req.body;
  const tenantId = req.admin.tenant_id;
  if (!product_id || !name || !price) {
    return res.status(400).json({ error: 'product_id, name, and price required' });
  }
  try {
    const { rows: [variant] } = await pool.query(
      `INSERT INTO product_variants (product_id, tenant_id, name, description, price)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [product_id, tenantId, name, description || null, price]
    );
    res.json(variant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/variants/:id
router.put('/variants/:id', async (req, res) => {
  const { id }                                  = req.params;
  const { name, description, price, is_active } = req.body;
  const tenantId                                = req.admin.tenant_id;
  try {
    const fields = [];
    const values = [];
    let idx = 1;
    if (name        !== undefined) { fields.push(`name=$${idx++}`);        values.push(name); }
    if (description !== undefined) { fields.push(`description=$${idx++}`); values.push(description); }
    if (price       !== undefined) { fields.push(`price=$${idx++}`);       values.push(price); }
    if (is_active   !== undefined) { fields.push(`is_active=$${idx++}`);   values.push(is_active); }

    if (!fields.length) return res.status(400).json({ error: 'No fields to update.' });

    values.push(id, tenantId);
    const { rows: [variant] } = await pool.query(
      `UPDATE product_variants SET ${fields.join(', ')}
       WHERE id=$${idx++} AND tenant_id=$${idx} RETURNING *`,
      values
    );
    if (!variant) return res.status(404).json({ error: 'Variant not found' });
    res.json(variant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/variants/:id
router.delete('/variants/:id', async (req, res) => {
  const { id }   = req.params;
  const tenantId = req.admin.tenant_id;
  try {
    await pool.query(
      `DELETE FROM product_variants WHERE id=$1 AND tenant_id=$2`,
      [id, tenantId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;