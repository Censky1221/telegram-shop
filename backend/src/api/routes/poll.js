const express = require('express');
const router = express.Router();
const { pool } = require('../../db/pool');
const { getBotByTenantId } = require('../../bot/tenantManager');


// 🔥 CREATE POLL + KIRIM KE TELEGRAM
router.post('/', async (req, res) => {
  try {
    const { question, options, tenant_id } = req.body;

    if (!question || !options || options.length < 2) {
      return res.status(400).json({ error: 'Invalid poll data' });
    }

    const { rows: [poll] } = await pool.query(
      `INSERT INTO polls (question, options, tenant_id)
       VALUES ($1,$2,$3) RETURNING *`,
      [question, JSON.stringify(options), tenant_id]
    );

    const bot = getBotByTenantId(tenant_id);
    if (!bot) return res.json(poll);

    // tombol polling
    const buttons = options.map((opt, i) => ([
      { text: opt, callback_data: `vote_${poll.id}_${i}` }
    ]));

    await bot.telegram.sendMessage(
      process.env.ADMIN_TELEGRAM_ID,
      `📊 *Polling Baru!*\n\n${question}`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: buttons
        }
      }
    );

    res.json(poll);

  } catch (err) {
    console.error('CREATE POLL ERROR:', err);
    res.status(500).json({ error: 'Failed create poll' });
  }
});


// 🔥 HASIL POLLING (MULTI TENANT)
router.get('/:id/result', async (req, res) => {
  try {
    const pollId = req.params.id;
    const tenantId = req.query.tenant_id;

    const { rows } = await pool.query(`
      SELECT option_index, COUNT(*) as total
      FROM poll_votes
      WHERE poll_id=$1 AND tenant_id=$2
      GROUP BY option_index
    `, [pollId, tenantId]);

    res.json(rows);

  } catch (err) {
    console.error('GET RESULT ERROR:', err);
    res.status(500).json({ error: 'Failed get result' });
  }
});


// 🔥 LIST POLL (UNTUK DASHBOARD)
router.get('/', async (req, res) => {
  const tenantId = req.query.tenant_id;

  const { rows } = await pool.query(
    `SELECT * FROM polls WHERE tenant_id=$1 ORDER BY id DESC`,
    [tenantId]
  );

  res.json(rows);
});


module.exports = router;