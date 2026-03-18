const db = require('../../db/pool');

module.exports = (bot) => {
  bot.hears('📦 Pesanan Saya', showOrders);
  bot.command('orders', showOrders);

  async function showOrders(ctx) {
    try {
      const { rows: [user] } = await db.query(
        'SELECT id FROM users WHERE telegram_id = $1',
        [ctx.from.id]
      );

      if (!user) return ctx.reply('Anda belum pernah melakukan pesanan.');

      const { rows } = await db.query(
        `SELECT o.id, o.amount, o.status, o.created_at, p.name AS product_name
         FROM orders o
         JOIN products p ON p.id = o.product_id
         WHERE o.user_id = $1
         ORDER BY o.created_at DESC
         LIMIT 10`,
        [user.id]
      );

      if (!rows.length) return ctx.reply('Anda belum memiliki pesanan.');

      const statusEmoji = {
        pending: '⏳',
        paid: '✅',
        failed: '❌',
        expired: '⌛',
      };

      const lines = rows.map((o) =>
        `${statusEmoji[o.status] || '?'} *#${o.id}* — ${o.product_name}\n` +
        `   Rp ${Number(o.amount).toLocaleString('id-ID')} | ${o.status.toUpperCase()}`
      );

      await ctx.reply(
        `📦 *10 Pesanan Terakhir:*\n\n${lines.join('\n\n')}`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('showOrders error:', err);
      ctx.reply('Gagal memuat pesanan.');
    }
  }
};
