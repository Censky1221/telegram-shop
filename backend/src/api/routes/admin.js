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
    const { rows: [admin] } = await pool.query(
      'SELECT * FROM admins WHERE email = $1', [email]
    );
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
      `INSERT INTO admins (email, password_hash, tenant_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email, tenant_id`,
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
    `SELECT p.*, COUNT(s.id) FILTER (WHERE s.status='available') AS available,
            COUNT(s.id) FILTER (WHERE s.status='sold') AS sold
     FROM products p LEFT JOIN stocks s ON s.product_id = p.id
     WHERE p.tenant_id=$1
     GROUP BY p.id ORDER BY p.id`,
    [req.admin.tenant_id]
  );
  res.json(rows);
});

router.post('/products', authMiddleware, async (req, res) => {
  const { name, description, price, terms } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'name and price required' });
  const { rows: [p] } = await pool.query(
    `INSERT INTO products (name, description, price, terms, tenant_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [name, description, price, terms || null, req.admin.tenant_id]
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
  await pool.query(
    `UPDATE products SET is_active=false WHERE id=$1 AND tenant_id=$2`,
    [req.params.id, req.admin.tenant_id]
  );
  res.json({ message: 'Product deactivated' });
});

// ── Hapus permanen produk (hanya jika stok = 0) ───────────────────
router.delete('/products/:id/destroy', authMiddleware, async (req, res) => {
  try {
    await pool.query(`DELETE FROM stocks WHERE product_id=$1 AND tenant_id=$2`, [req.params.id, req.admin.tenant_id]);
    await pool.query(`DELETE FROM products WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.admin.tenant_id]);
    res.json({ message: 'Product deleted permanently' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Stocks ────────────────────────────────────────────────────────
router.get('/stocks/:productId', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, email, status, created_at FROM stocks
     WHERE product_id=$1 AND tenant_id=$2 ORDER BY id DESC`,
    [req.params.productId, req.admin.tenant_id]
  );
  res.json(rows);
});

router.post('/stocks/upload', authMiddleware, async (req, res) => {
  const { product_id, stocks } = req.body;
  if (!product_id || !Array.isArray(stocks) || !stocks.length) {
    return res.status(400).json({ error: 'product_id and stocks array required' });
  }

  const valid = stocks.filter(s => s.email && s.password);
  if (!valid.length) return res.status(400).json({ error: 'No valid entries found' });

  const values = valid
    .map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3}, 'available', $${valid.length * 2 + 2})`)
    .join(', ');
  const params = [product_id, ...valid.flatMap(s => [s.email, s.password]), req.admin.tenant_id];

  const result = await pool.query(
    `INSERT INTO stocks (product_id, email, password, status, tenant_id) VALUES ${values}`,
    params
  );
  res.json({ inserted: result.rowCount });
});

// ── Orders ────────────────────────────────────────────────────────
router.get('/orders', authMiddleware, async (req, res) => {
  const { status, page = 1 } = req.query;
  const limit  = 50;
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE o.tenant_id = $3';
  const params = [limit, offset, req.admin.tenant_id];
  if (status) {
    whereClause += ' AND o.status = $4';
    params.push(status);
  }

  const { rows } = await pool.query(
    `SELECT o.id, o.amount, o.status, o.payment_id, o.created_at, o.paid_at,
            p.name AS product_name,
            u.username AS telegram_username, u.telegram_id
     FROM orders o
     JOIN products p ON p.id = o.product_id
     JOIN users u ON u.id = o.user_id
     ${whereClause}
     ORDER BY o.created_at DESC
     LIMIT $1 OFFSET $2`,
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
    console.error('GET /users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.post('/users/:id/topup', authMiddleware, async (req, res) => {
  const { amount, note } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

  try {
    const { rows: [user] } = await pool.query(
      `UPDATE users SET balance = balance + $1
       WHERE id=$2 AND tenant_id=$3
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
          `💰 *Saldo Ditambahkan!*\n\n` +
          `+Rp ${Number(amount).toLocaleString('id-ID')}\n` +
          `Saldo sekarang: *Rp ${Number(user.balance).toLocaleString('id-ID')}*\n\n` +
          (note ? `📝 Catatan: ${note}` : ''),
          { parse_mode: 'Markdown' }
        );
      }
    } catch (e) { console.warn('Telegram notify failed:', e.message); }

    res.json({ success: true, user });
  } catch (err) {
    console.error('topup error:', err);
    res.status(500).json({ error: 'Topup failed' });
  }
});

router.post('/users/:id/deduct', authMiddleware, async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

  try {
    const { rows: [user] } = await pool.query(
      `UPDATE users SET balance = GREATEST(balance - $1, 0)
       WHERE id=$2 AND tenant_id=$3
       RETURNING id, telegram_id, username, balance`,
      [amount, req.params.id, req.admin.tenant_id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    console.error('deduct error:', err);
    res.status(500).json({ error: 'Deduct failed' });
  }
});

// ── Settings (Banner + S&K) ───────────────────────────────────────
router.get('/settings', authMiddleware, async (req, res) => {
  const { rows: [tenant] } = await pool.query(
    `SELECT banner_file_id, terms FROM tenants WHERE id=$1`,
    [req.admin.tenant_id]
  );
  res.json(tenant || {});
});

router.put('/settings', authMiddleware, async (req, res) => {
  const { banner_file_id, terms } = req.body;
  await pool.query(
    `UPDATE tenants SET banner_file_id=$1, terms=$2 WHERE id=$3`,
    [banner_file_id || null, terms || null, req.admin.tenant_id]
  );
  res.json({ success: true });
});

// ── Broadcast ─────────────────────────────────────────────────────
router.post('/broadcast', authMiddleware, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  try {
    const { rows: users } = await pool.query(
      `SELECT telegram_id FROM users WHERE tenant_id=$1`,
      [req.admin.tenant_id]
    );

    const { getBotByTenantId } = require('../../bot/tenantManager');
    const bot = getBotByTenantId(req.admin.tenant_id);
    if (!bot) return res.status(500).json({ error: 'Bot tidak ditemukan.' });

    let sent = 0, failed = 0;
    for (const user of users) {
      try {
        await bot.telegram.sendMessage(user.telegram_id, message, { parse_mode: 'Markdown' });
        sent++;
      } catch {
        failed++;
      }
    }

    res.json({ success: true, sent, failed, total: users.length });
  } catch (err) {
    console.error('broadcast error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;