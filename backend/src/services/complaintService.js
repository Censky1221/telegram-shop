const { pool } = require('../db/pool');

async function notifyAdminComplaint(c) {
  const { getBotByTenantId } = require('../bot/tenantManager');
  const bot = getBotByTenantId(c.tenant_id);
  if (!bot) return;

  const { rows: [t] } = await pool.query(
    `SELECT admin_telegram_id FROM tenants WHERE id=$1`,
    [c.tenant_id]
  );

  if (!t?.admin_telegram_id) return;

  const text = `
🚨 KOMPLAIN BARU

🧾 Order: #${c.order_id}
👤 User ID: ${c.user_id}
📦 Produk ID: ${c.product_id}

⚠️ Reason: ${c.reason}
`;

  await bot.telegram.sendMessage(t.admin_telegram_id, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔁 Kirim Pengganti', callback_data: `replace_${c.id}` }]
      ]
    }
  });
}

module.exports = { notifyAdminComplaint };