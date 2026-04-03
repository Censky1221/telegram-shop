const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/stocks', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT order_id, COUNT(*) as total
    FROM stocks
    WHERE order_id IS NOT NULL
    GROUP BY order_id
  `);

  res.json(rows);
});

module.exports = router;