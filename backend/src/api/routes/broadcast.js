const express = require('express');
const router  = express.Router();
const { pool } = require('../../db/pool');

// POST /api/admin/broadcast
router.post('/', async (req, res) => {
  const { message } = req.body;
  const tenantId    = req.tenant.id;

  if (!message?.trim()) {
    return res.status(400).json({ success: false, error: 'Pesan tidak boleh kosong.' });
  }

  try {
    // Ambil semua user di tenant ini
    const { rows: users } = await pool.query(
      `SELECT telegram_id FROM users WHERE tenant_id=$1`,
      [tenantId]
    );

    if (!users.length) {
      return res.json({ success: true, sent: 0, failed: 0, total: 0 });
    }

    // Ambil bot token dari tenant
    const { rows: [tenant] } = await pool.query(
      `SELECT bot_token FROM tenants WHERE id=$1`,
      [tenantId]
    );

    if (!tenant?.bot_token) {
      return res.status(500).json({ success: false, error: 'Bot token tidak ditemukan.' });
    }

    const TELEGRAM_API = `https://api.telegram.org/bot${tenant.bot_token}`;
    let sent   = 0;
    let failed = 0;

    // Kirim pesan satu per satu dengan delay kecil agar tidak kena rate limit
    for (const user of users) {
      try {
        const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
          method : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify({
            chat_id   : user.telegram_id,
            text      : message,
            parse_mode: 'Markdown',
          }),
        });
        const data = await response.json();
        if (data.ok) {
          sent++;
        } else {
          failed++;
          console.log(`Broadcast failed for ${user.telegram_id}:`, data.description);
        }
      } catch (err) {
        failed++;
        console.error(`Broadcast error for ${user.telegram_id}:`, err.message);
      }

      // Delay 50ms antar pesan agar tidak kena rate limit Telegram (30 msg/detik)
      await new Promise(r => setTimeout(r, 50));
    }

    return res.json({
      success: true,
      sent,
      failed,
      total: users.length,
    });

  } catch (err) {
    console.error('Broadcast error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;