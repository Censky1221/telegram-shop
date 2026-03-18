const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();
const db = require('../../db/pool');
const authMiddleware = require('../middleware/auth');

// ── Auth ─────────────────────────────────────────────────────────
// POST /api/admin/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const { rows: [admin] } = await db.query(
      'SELECT * FROM admins WHERE email = $1', [email]
    );
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: admin.id, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token, email: admin.email });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── Products ─────────────────────────────────────────────────────
router.get('/products', authMiddleware, async (req, res) => {
  const { rows } = await db.query(
    `SELECT p.*, COUNT(s.id) FILTER (WHERE s.status='available') AS available,
            COUNT(s.id) FILTER (WHERE s.status='sold') AS sold
     FROM products p LEFT JOIN stocks s ON s.product_id = p.id
     GROUP BY p.id ORDER BY p.id`
  );
  res.json(rows);
});

router.post('/products', authMiddleware, async (req, res) => {
  const { name, description, price } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'name and price required' });
  const { rows: [p] } = await db.query(
    `INSERT INTO products (name, description, price) VALUES ($1,$2,$3) RETURNING *`,
    [name, description, price]
  );
  res.status(201).json(p);
});

router.put('/products/:id', authMiddleware, async (req, res) => {
  const { name, description, price, is_active } = req.body;
  const { rows: [p] } = await db.query(
    `UPDATE products SET name=$1, description=$2, price=$3, is_active=$4
     WHERE id=$5 RETURNING *`,
    [name, description, price, is_active, req.params.id]
  );
  if (!p) return res.status(404).json({ error: 'Product not found' });
  res.json(p);
});

router.delete('/products/:id', authMiddleware, async (req, res) => {
  await db.query(`UPDATE products SET is_active=false WHERE id=$1`, [req.params.id]);
  res.json({ message: 'Product deactivated' });
});

// ── Stocks ───────────────────────────────────────────────────────
// GET /api/admin/stocks/:productId
router.get('/stocks/:productId', authMiddleware, async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, email, status, created_at FROM stocks
     WHERE product_id = $1 ORDER BY id DESC`,
    [req.params.productId]
  );
  res.json(rows);
});

// POST /api/admin/stocks/upload  — bulk upload email:password
router.post('/stocks/upload', authMiddleware, async (req, res) => {
  const { product_id, stocks } = req.body;
  if (!product_id || !Array.isArray(stocks) || !stocks.length) {
    return res.status(400).json({ error: 'product_id and stocks array required' });
  }

  const valid = stocks.filter(s => s.email && s.password);
  if (!valid.length) return res.status(400).json({ error: 'No valid entries found' });

  const values = valid
    .map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3}, 'available')`)
    .join(', ');
  const params = [product_id, ...valid.flatMap(s => [s.email, s.password])];

  const result = await db.query(
    `INSERT INTO stocks (product_id, email, password, status) VALUES ${values}`,
    params
  );
  res.json({ inserted: result.rowCount });
});

// ── Orders ───────────────────────────────────────────────────────
router.get('/orders', authMiddleware, async (req, res) => {
  const { status, page = 1 } = req.query;
  const limit = 50;
  const offset = (page - 1) * limit;

  let whereClause = '';
  const params = [limit, offset];
  if (status) {
    whereClause = 'WHERE o.status = $3';
    params.push(status);
  }

  const { rows } = await db.query(
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

// ── Users & Balance ──────────────────────────────────────────────
router.get('/users', authMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, telegram_id, username, first_name, balance, created_at
       FROM users ORDER BY created_at DESC`
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
    const { rows: [user] } = await db.query(
      `UPDATE users SET balance = balance + $1 WHERE id = $2
       RETURNING id, telegram_id, username, balance`,
      [amount, req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Notify user via Telegram
    try {
      const bot = require('../../bot');
      await bot.telegram.sendMessage(
        user.telegram_id,
        `💰 *Saldo Ditambahkan!*\n\n` +
        `+Rp ${Number(amount).toLocaleString('id-ID')}\n` +
        `Saldo sekarang: *Rp ${Number(user.balance).toLocaleString('id-ID')}*\n\n` +
        (note ? `📝 Catatan: ${note}` : ''),
        { parse_mode: 'Markdown' }
      );
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
    const { rows: [user] } = await db.query(
      `UPDATE users SET balance = GREATEST(balance - $1, 0) WHERE id = $2
       RETURNING id, telegram_id, username, balance`,
      [amount, req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    console.error('deduct error:', err);
    res.status(500).json({ error: 'Deduct failed' });
  }
});

// ── module.exports harus di PALING BAWAH ────────────────────────
module.exports = router;