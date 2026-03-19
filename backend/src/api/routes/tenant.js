const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const { pool } = require('../../db/pool');
const { startTenantBot, stopTenantBot, restartTenantBot } = require('../../bot/tenantManager');

function superAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'super') return res.status(403).json({ error: 'Forbidden' });
    req.super = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// GET /api/tenant
router.get('/', superAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.id, t.name, t.bot_token, t.status, t.plan, t.expired_at, t.created_at,
            t.tripay_merchant_code, t.tripay_mode, t.payment_gateway,
            t.pakasir_project_slug,
            CASE WHEN t.tripay_api_key IS NOT NULL THEN LEFT(t.tripay_api_key, 10) || '•••' ELSE NULL END AS tripay_api_key_preview,
            CASE WHEN t.tripay_private_key IS NOT NULL THEN LEFT(t.tripay_private_key, 8) || '•••' ELSE NULL END AS tripay_private_key_preview,
            COUNT(DISTINCT u.id) AS total_users,
            COUNT(DISTINCT o.id) AS total_orders,
            COUNT(DISTINCT p.id) AS total_products
     FROM tenants t
     LEFT JOIN users u ON u.tenant_id = t.id
     LEFT JOIN orders o ON o.tenant_id = t.id
     LEFT JOIN products p ON p.tenant_id = t.id
     GROUP BY t.id ORDER BY t.created_at DESC`
  );
  res.json(rows);
});

// POST /api/tenant
router.post('/', superAuth, async (req, res) => {
  const {
    name, bot_token, plan, expired_at,
    tripay_api_key, tripay_private_key, tripay_merchant_code, tripay_mode,
    pakasir_api_key, pakasir_project_slug, payment_gateway,
  } = req.body;
  if (!name || !bot_token) return res.status(400).json({ error: 'name and bot_token required' });

  try {
    const { rows: [tenant] } = await pool.query(
      `INSERT INTO tenants (
        name, bot_token, plan, expired_at,
        tripay_api_key, tripay_private_key, tripay_merchant_code, tripay_mode,
        pakasir_api_key, pakasir_project_slug, payment_gateway
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        name, bot_token, plan || 'basic', expired_at || null,
        tripay_api_key || null, tripay_private_key || null,
        tripay_merchant_code || null, tripay_mode || 'sandbox',
        pakasir_api_key || null, pakasir_project_slug || null,
        payment_gateway || 'tripay',
      ]
    );
    await startTenantBot(tenant);
    res.status(201).json(tenant);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Bot token sudah digunakan' });
    console.error('create tenant error:', err);
    res.status(500).json({ error: 'Failed to create tenant' });
  }
});

// PUT /api/tenant/:id
router.put('/:id', superAuth, async (req, res) => {
  const {
    name, bot_token, status, plan, expired_at,
    tripay_api_key, tripay_private_key, tripay_merchant_code, tripay_mode,
    pakasir_api_key, pakasir_project_slug, payment_gateway,
  } = req.body;

  try {
    const { rows: [old] } = await pool.query('SELECT * FROM tenants WHERE id=$1', [req.params.id]);
    if (!old) return res.status(404).json({ error: 'Tenant not found' });

    const { rows: [tenant] } = await pool.query(
      `UPDATE tenants SET
        name=$1, bot_token=$2, status=$3, plan=$4, expired_at=$5,
        tripay_api_key=$6, tripay_private_key=$7, tripay_merchant_code=$8, tripay_mode=$9,
        pakasir_api_key=$10, pakasir_project_slug=$11, payment_gateway=$12
       WHERE id=$13 RETURNING *`,
      [
        name, bot_token, status || old.status, plan, expired_at || null,
        tripay_api_key     || old.tripay_api_key,
        tripay_private_key || old.tripay_private_key,
        tripay_merchant_code || old.tripay_merchant_code,
        tripay_mode        || old.tripay_mode,
        pakasir_api_key    || old.pakasir_api_key,
        pakasir_project_slug || old.pakasir_project_slug,
        payment_gateway    || old.payment_gateway || 'tripay',
        req.params.id,
      ]
    );
    await restartTenantBot(tenant.id);
    res.json(tenant);
  } catch (err) {
    console.error('update tenant error:', err);
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

// DELETE /api/tenant/:id
router.delete('/:id', superAuth, async (req, res) => {
  await stopTenantBot(parseInt(req.params.id));
  await pool.query('DELETE FROM tenants WHERE id=$1', [req.params.id]);
  res.json({ message: 'Tenant deleted' });
});

// POST /api/tenant/:id/suspend
router.post('/:id/suspend', superAuth, async (req, res) => {
  await pool.query(`UPDATE tenants SET status='suspended' WHERE id=$1`, [req.params.id]);
  await stopTenantBot(parseInt(req.params.id));
  res.json({ message: 'Tenant suspended' });
});

// POST /api/tenant/:id/activate
router.post('/:id/activate', superAuth, async (req, res) => {
  const { rows: [tenant] } = await pool.query(
    `UPDATE tenants SET status='active' WHERE id=$1 RETURNING *`, [req.params.id]
  );
  await startTenantBot(tenant);
  res.json({ message: 'Tenant activated', tenant });
});

module.exports = router;