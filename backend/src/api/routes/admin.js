const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const router  = express.Router();
const { pool } = require('../../db/pool');

// ── Auth Middleware ───────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Login ─────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const { rows: [admin] } = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign(
      { id: admin.id, email: admin.email, tenant_id: admin.tenant_id },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token, email: admin.email, tenant_id: admin.tenant_id });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── Register ──────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { email, password, tenant_id } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });
  try {
    if (tenant_id) {
      const { rows: [tenant] } = await pool.query(
        'SELECT id FROM tenants WHERE id=$1 AND status=$2', [tenant_id, 'active']
      );
      if (!tenant) return res.status(404).json({ error: 'Tenant tidak ditemukan atau tidak aktif' });
    }
    const hash = await bcrypt.hash(password, 12);
    const { rows: [admin] } = await pool.query(
      `INSERT INTO admins (email, password_hash, tenant_id) VALUES ($1,$2,$3)
       ON CONFLICT (email) DO NOTHING RETURNING id, email, tenant_id`,
      [email, hash, tenant_id || null]
    );
    if (!admin) return res.status(409).json({ error: 'Email sudah terdaftar' });
    res.status(201).json({ message: 'Admin created', email: admin.email });
  } catch (err) {
    console.error('register error:', err);
    res.status(500).json({ error: 'Register failed' });
  }
});

// ── Products ──────────────────────────────────────────────────────
router.get('/products', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*,
            COUNT(s.id) FILTER (WHERE s.status='available') AS available,
            COUNT(s.id) FILTER (WHERE s.status='sold') AS sold
     FROM products p
     LEFT JOIN stocks s ON s.product_id = p.id
     WHERE p.tenant_id=$1
     GROUP BY p.id ORDER BY p.id`,
    [req.admin.tenant_id]
  );
  res.json(rows);
});

router.post('/products', authMiddleware, async (req, res) => {
  const { name, description, price, terms } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const { rows: [p] } = await pool.query(
    `INSERT INTO products (name, description, price, terms, tenant_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [name, description, price || 0, terms || null, req.admin.tenant_id]
  );
  res.status(201).json(p);
});

router.put('/products/:id', authMiddleware, async (req, res) => {
  const { name, description, price, is_active, terms } = req.body;
  const { rows: [p] } = await pool.query(
    `UPDATE products SET name=$1, description=$2, price=$3, is_active=$4, terms=$5
     WHERE id=$6 AND tenant_id=$7 RETURNING *`,
    [name, description, price, is_active, terms || null, req.params.id, req.admin.tenant_id]
  );
  if (!p) return res.status(404).json({ error: 'Product not found' });
  res.json(p);
});

router.delete('/products/:id', authMiddleware, async (req, res) => {
  await pool.query(`UPDATE products SET is_active=false WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.admin.tenant_id]);
  res.json({ message: 'Product deactivated' });
});

router.delete('/products/:id/destroy', authMiddleware, async (req, res) => {
  try {
    await pool.query(`DELETE FROM stocks WHERE product_id=$1 AND tenant_id=$2`, [req.params.id, req.admin.tenant_id]);
    await pool.query(`DELETE FROM product_variants WHERE product_id=$1 AND tenant_id=$2`, [req.params.id, req.admin.tenant_id]);
    await pool.query(`DELETE FROM products WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.admin.tenant_id]);
    res.json({ message: 'Product deleted permanently' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Variants ──────────────────────────────────────────────────────
router.get('/variants', authMiddleware, async (req, res) => {
  const { productId } = req.query;
  if (!productId) return res.status(400).json({ error: 'productId required' });
  try {
    const { rows } = await pool.query(
      `SELECT pv.*,
              COUNT(s.id) FILTER (WHERE s.status='available') AS stock_count,
              COUNT(s.id) FILTER (WHERE s.status='sold') AS sold_count
       FROM product_variants pv
       LEFT JOIN stocks s ON s.variant_id = pv.id
       WHERE pv.product_id=$1 AND pv.tenant_id=$2
       GROUP BY pv.id ORDER BY pv.id`,
      [productId, req.admin.tenant_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/variants', authMiddleware, async (req, res) => {
  const { product_id, name, description, price, terms } = req.body;
  if (!product_id || !name || price === undefined) return res.status(400).json({ error: 'product_id, name, price required' });
  try {
    const { rows: [v] } = await pool.query(
      `INSERT INTO product_variants (product_id, tenant_id, name, description, price, terms)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [product_id, req.admin.tenant_id, name, description || null, price, terms || null]
    );
    res.json(v);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/variants/:id', authMiddleware, async (req, res) => {
  const { name, description, price, is_active, terms } = req.body;
  try {
    const fields = [], values = [];
    let idx = 1;
    if (name        !== undefined) { fields.push(`name=$${idx++}`);        values.push(name); }
    if (description !== undefined) { fields.push(`description=$${idx++}`); values.push(description); }
    if (price       !== undefined) { fields.push(`price=$${idx++}`);       values.push(price); }
    if (is_active   !== undefined) { fields.push(`is_active=$${idx++}`);   values.push(is_active); }
    if (terms       !== undefined) { fields.push(`terms=$${idx++}`);       values.push(terms); }
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.params.id, req.admin.tenant_id);
    const { rows: [v] } = await pool.query(
      `UPDATE product_variants SET ${fields.join(', ')} WHERE id=$${idx++} AND tenant_id=$${idx} RETURNING *`,
      values
    );
    if (!v) return res.status(404).json({ error: 'Variant not found' });
    res.json(v);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/variants/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query(`DELETE FROM stocks WHERE variant_id=$1 AND tenant_id=$2`, [req.params.id, req.admin.tenant_id]);
    await pool.query(`DELETE FROM product_variants WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.admin.tenant_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Stocks ────────────────────────────────────────────────────────
router.get('/stocks/:productId', authMiddleware, async (req, res) => {
  const { variantId } = req.query;
  try {
    let query, params;
    if (variantId) {
      query  = `SELECT id, email, password, status, created_at FROM stocks WHERE variant_id=$1 AND tenant_id=$2 ORDER BY id DESC`;
      params = [variantId, req.admin.tenant_id];
    } else {
      query  = `SELECT id, email, password, status, created_at FROM stocks WHERE product_id=$1 AND variant_id IS NULL AND tenant_id=$2 ORDER BY id DESC`;
      params = [req.params.productId, req.admin.tenant_id];
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/stocks/upload', authMiddleware, async (req, res) => {
  const { product_id, variant_id, stocks } = req.body;
  if (!product_id || !Array.isArray(stocks) || !stocks.length)
    return res.status(400).json({ error: 'product_id and stocks required' });
  const valid = stocks.filter(s => s.email && s.password);
  if (!valid.length) return res.status(400).json({ error: 'No valid entries found' });
  try {
    let result;
    if (variant_id) {
      const values = valid.map((_, i) =>
        `($1, $2, $${i * 2 + 3}, $${i * 2 + 4}, 'available', $${valid.length * 2 + 3})`
      ).join(', ');
      const params = [product_id, variant_id, ...valid.flatMap(s => [s.email, s.password]), req.admin.tenant_id];
      result = await pool.query(
        `INSERT INTO stocks (product_id, variant_id, email, password, status, tenant_id) VALUES ${values}`, params
      );
    } else {
      const values = valid.map((_, i) =>
        `($1, $${i * 2 + 2}, $${i * 2 + 3}, 'available', $${valid.length * 2 + 2})`
      ).join(', ');
      const params = [product_id, ...valid.flatMap(s => [s.email, s.password]), req.admin.tenant_id];
      result = await pool.query(
        `INSERT INTO stocks (product_id, email, password, status, tenant_id) VALUES ${values}`, params
      );
    }
    res.json({ inserted: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/stocks/:id', authMiddleware, async (req, res) => {
  const { email, password } = req.body;
  try {
    const { rows: [s] } = await pool.query(
      `UPDATE stocks SET email=$1, password=$2 WHERE id=$3 AND tenant_id=$4 RETURNING *`,
      [email, password, req.params.id, req.admin.tenant_id]
    );
    if (!s) return res.status(404).json({ error: 'Stock not found' });
    res.json(s);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/stocks/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query(`DELETE FROM stocks WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.admin.tenant_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Orders ────────────────────────────────────────────────────────
router.get('/orders/search', authMiddleware, async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'ID required' });
  try {
    const { rows: [order] } = await pool.query(
      `SELECT o.id, o.amount, o.status, o.payment_id, o.created_at, o.paid_at,
              p.name AS product_name,
              u.username AS telegram_username, u.telegram_id
       FROM orders o
       JOIN products p ON p.id = o.product_id
       JOIN users u ON u.id = o.user_id
       WHERE o.id=$1 AND o.tenant_id=$2`,
      [id, req.admin.tenant_id]
    );
    if (!order) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/orders', authMiddleware, async (req, res) => {
  const { status, page = 1 } = req.query;
  const limit = 50, offset = (page - 1) * limit;
  let whereClause = 'WHERE o.tenant_id = $3';
  const params = [limit, offset, req.admin.tenant_id];
  if (status) { whereClause += ' AND o.status = $4'; params.push(status); }
  const { rows } = await pool.query(
    `SELECT o.id, o.amount, o.status, o.payment_id, o.created_at, o.paid_at,
            p.name AS product_name,
            u.username AS telegram_username, u.telegram_id
     FROM orders o
     JOIN products p ON p.id = o.product_id
     JOIN users u ON u.id = o.user_id
     ${whereClause}
     ORDER BY o.created_at DESC LIMIT $1 OFFSET $2`,
    params
  );
  res.json(rows);
});

// ── Users & Balance ───────────────────────────────────────────────
router.get('/users', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, telegram_id, username, first_name, balance, created_at
       FROM users WHERE tenant_id=$1 ORDER BY created_at DESC`,
      [req.admin.tenant_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.post('/users/:id/topup', authMiddleware, async (req, res) => {
  const { amount, note } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
  try {
    const { rows: [user] } = await pool.query(
      `UPDATE users SET balance = balance + $1 WHERE id=$2 AND tenant_id=$3
       RETURNING id, telegram_id, username, balance`,
      [amount, req.params.id, req.admin.tenant_id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    try {
      const { getBotByTenantId } = require('../../bot/tenantManager');
      const bot = getBotByTenantId(req.admin.tenant_id);
      if (bot) {
        await bot.telegram.sendMessage(
          user.telegram_id,
          `💰 *Saldo Ditambahkan!*\n\n+Rp ${Number(amount).toLocaleString('id-ID')}\n` +
          `Saldo sekarang: *Rp ${Number(user.balance).toLocaleString('id-ID')}*\n\n` +
          (note ? `📝 Catatan: ${note}` : ''),
          { parse_mode: 'Markdown' }
        );
      }
    } catch (e) { console.warn('Telegram notify failed:', e.message); }
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: 'Topup failed' });
  }
});

router.post('/users/:id/deduct', authMiddleware, async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
  try {
    const { rows: [user] } = await pool.query(
      `UPDATE users SET balance = GREATEST(balance - $1, 0) WHERE id=$2 AND tenant_id=$3
       RETURNING id, telegram_id, username, balance`,
      [amount, req.params.id, req.admin.tenant_id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: 'Deduct failed' });
  }
});

// ── Settings ──────────────────────────────────────────────────────
router.get('/settings', authMiddleware, async (req, res) => {
  const { rows: [tenant] } = await pool.query(
    `SELECT banner_file_id, terms, help_text FROM tenants WHERE id=$1`, [req.admin.tenant_id]
  );
  res.json(tenant || {});
});

router.put('/settings', authMiddleware, async (req, res) => {
  const { banner_file_id, terms, help_text } = req.body;
  await pool.query(
    `UPDATE tenants SET banner_file_id=$1, terms=$2, help_text=$3 WHERE id=$4`,
    [banner_file_id || null, terms || null, help_text || null, req.admin.tenant_id]
  );
  res.json({ success: true });
});

// ── Broadcast ─────────────────────────────────────────────────────
router.post('/broadcast', authMiddleware, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });
  try {
    const { rows: users } = await pool.query(
      `SELECT telegram_id FROM users WHERE tenant_id=$1`, [req.admin.tenant_id]
    );
    const { getBotByTenantId } = require('../../bot/tenantManager');
    const bot = getBotByTenantId(req.admin.tenant_id);
    if (!bot) return res.status(500).json({ error: 'Bot tidak ditemukan.' });
    let sent = 0, failed = 0;
    for (const user of users) {
      try {
        await bot.telegram.sendMessage(user.telegram_id, message, { parse_mode: 'Markdown' });
        sent++;
      } catch { failed++; }
    }
    res.json({ success: true, sent, failed, total: users.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Statistik ─────────────────────────────────────────────────────
router.get('/stats', authMiddleware, async (req, res) => {
  const tid = req.admin.tenant_id;
  try {
    const [revToday, revWeek, revMonth, ordersPaid, ordersPending, usersTotal, usersNewWeek, topProducts, dailyChart] = await Promise.all([
      // Pendapatan hari ini
      pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM orders WHERE tenant_id=$1 AND status='paid' AND paid_at >= CURRENT_DATE`, [tid]),
      // Pendapatan minggu ini
      pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM orders WHERE tenant_id=$1 AND status='paid' AND paid_at >= date_trunc('week', NOW())`, [tid]),
      // Pendapatan bulan ini
      pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM orders WHERE tenant_id=$1 AND status='paid' AND paid_at >= date_trunc('month', NOW())`, [tid]),
      // Total paid
      pool.query(`SELECT COUNT(*) AS cnt FROM orders WHERE tenant_id=$1 AND status='paid'`, [tid]),
      // Total pending
      pool.query(`SELECT COUNT(*) AS cnt FROM orders WHERE tenant_id=$1 AND status='pending'`, [tid]),
      // Total user
      pool.query(`SELECT COUNT(*) AS cnt FROM users WHERE tenant_id=$1`, [tid]),
      // User baru 7 hari
      pool.query(`SELECT COUNT(*) AS cnt FROM users WHERE tenant_id=$1 AND created_at >= NOW() - INTERVAL '7 days'`, [tid]),
      // Top produk/varian
      pool.query(`
        SELECT p.name AS product_name, pv.name AS variant_name,
               COALESCE(SUM(o.qty),0) AS total_sold,
               COALESCE(SUM(o.amount),0) AS total_revenue
        FROM orders o
        JOIN products p ON p.id = o.product_id
        LEFT JOIN product_variants pv ON pv.id = o.variant_id
        WHERE o.tenant_id=$1 AND o.status='paid'
        GROUP BY p.name, pv.name
        ORDER BY total_sold DESC LIMIT 10`, [tid]),
      // Grafik 14 hari
      pool.query(`
        SELECT DATE(paid_at) AS date, COUNT(*) AS count, COALESCE(SUM(amount),0) AS total
        FROM orders WHERE tenant_id=$1 AND status='paid'
          AND paid_at >= NOW() - INTERVAL '14 days'
        GROUP BY DATE(paid_at) ORDER BY date ASC`, [tid]),
    ]);

    res.json({
      revenue_today   : revToday.rows[0].total,
      revenue_week    : revWeek.rows[0].total,
      revenue_month   : revMonth.rows[0].total,
      orders_paid     : ordersPaid.rows[0].cnt,
      orders_pending  : ordersPending.rows[0].cnt,
      users_total     : usersTotal.rows[0].cnt,
      users_new_week  : usersNewWeek.rows[0].cnt,
      top_products    : topProducts.rows,
      daily_chart     : dailyChart.rows,
    });
  } catch (err) {
    console.error('stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;