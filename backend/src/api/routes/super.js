const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const router  = express.Router();
const { pool } = require('../../db/pool');

// Super admin credentials dari .env
const SUPER_EMAIL    = process.env.SUPER_ADMIN_EMAIL    || 'super@admin.com';
const SUPER_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'superadmin123';

// POST /api/super/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (email !== SUPER_EMAIL || password !== SUPER_PASSWORD) {
    return res.status(401).json({ error: 'Invalid super admin credentials' });
  }
  const token = jwt.sign(
    { role: 'super', email },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({ token, email, role: 'super' });
});

module.exports = router;