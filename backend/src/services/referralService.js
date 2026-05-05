const { pool } = require('../db/pool');

// ── Generate kode unik 8 karakter ────────────────────────────────
async function generateUniqueReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code, exists = true;
  while (exists) {
    code = Array.from({ length: 8 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
    const { rows } = await pool.query(
      'SELECT id FROM users WHERE referral_code=$1', [code]
    );
    exists = rows.length > 0;
  }
  return code;
}

// ── Pastikan user punya referral_code ────────────────────────────
async function ensureReferralCode(userId) {
  const { rows: [user] } = await pool.query(
    'SELECT referral_code FROM users WHERE id=$1', [userId]
  );
  if (user?.referral_code) return user.referral_code;

  const code = await generateUniqueReferralCode();
  await pool.query('UPDATE users SET referral_code=$1 WHERE id=$2', [code, userId]);
  return code;
}

// ── Cek & beri bonus ke referrer saat referred user beli pertama ─
async function checkAndAwardReferral(userId, tenantId, orderId, bot) {
  try {
    // Ambil data referred_by
    const { rows: [user] } = await pool.query(
      'SELECT referred_by FROM users WHERE id=$1 AND tenant_id=$2',
      [userId, tenantId]
    );
    if (!user?.referred_by) return;

    // Cek apakah bonus sudah pernah diberikan
    const { rows: [existing] } = await pool.query(
      'SELECT id FROM referrals WHERE referred_id=$1 AND tenant_id=$2',
      [userId, tenantId]
    );
    if (existing) return;

    // Ambil settings referral
    const { rows: [settings] } = await pool.query(
      'SELECT * FROM referral_settings WHERE tenant_id=$1', [tenantId]
    );
    if (!settings?.is_active) return;

    const bonusAmount = settings.bonus_amount || 500;

    // Berikan bonus ke referrer
    await pool.query(
      'UPDATE users SET balance = balance + $1 WHERE id=$2',
      [bonusAmount, user.referred_by]
    );

    // Catat di tabel referrals
    await pool.query(
      `INSERT INTO referrals (tenant_id, referrer_id, referred_id, order_id, bonus_amount)
       VALUES ($1,$2,$3,$4,$5)`,
      [tenantId, user.referred_by, userId, orderId, bonusAmount]
    );

    // Notif ke referrer via Telegram
    if (bot) {
      const { rows: [referrer] } = await pool.query(
        'SELECT telegram_id FROM users WHERE id=$1', [user.referred_by]
      );
      if (referrer) {
        await bot.telegram.sendMessage(
          referrer.telegram_id,
          `🎉 *Bonus Referral Masuk!*\n\n` +
          `Teman yang kamu ajak baru saja melakukan pembelian pertama! 🛍\n\n` +
          `💰 Bonus *Rp ${Number(bonusAmount).toLocaleString('id-ID')}* sudah masuk ke saldo kamu!\n\n` +
          `_Semakin banyak ajak teman, semakin banyak bonus!_ 🚀`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});
      }
    }
  } catch (err) {
    console.error('checkAndAwardReferral error:', err.message);
  }
}

module.exports = { generateUniqueReferralCode, ensureReferralCode, checkAndAwardReferral };
