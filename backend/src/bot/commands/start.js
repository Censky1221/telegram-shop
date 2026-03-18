const { Markup } = require('telegraf');
const db = require('../../db/pool');

module.exports = (bot) => {
  bot.start(async (ctx) => {
    try {
      await db.query(
        `INSERT INTO users (telegram_id, username, first_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (telegram_id) DO UPDATE
           SET username   = EXCLUDED.username,
               first_name = EXCLUDED.first_name`,
        [ctx.from.id, ctx.from.username || null, ctx.from.first_name || 'User']
      );

      const bannerUrl = process.env.BANNER_URL || 'https://via.placeholder.com/1200x400/6366f1/ffffff?text=Digital+Store';

      try {
        await ctx.replyWithPhoto(
          { url: bannerUrl },
          {
            caption:
              `🏪 *Selamat datang di toko kami!*\n\n` +
              `👤 Halo, *${ctx.from.first_name}*!\n\n` +
              `Pilih menu di bawah untuk mulai berbelanja. 🛍`,
            parse_mode: 'Markdown',
            ...Markup.keyboard([
              ['🛍 Daftar Produk', '💰 Saldo Saya'],
              ['📦 Pesanan Saya', '📞 Bantuan'],
            ]).resize(),
          }
        );
      } catch {
        // Fallback jika gambar gagal
        await ctx.reply(
          `🏪 *Selamat datang di toko kami!*\n\n` +
          `👤 Halo, *${ctx.from.first_name}*!\n\n` +
          `Pilih menu di bawah untuk mulai berbelanja. 🛍`,
          {
            parse_mode: 'Markdown',
            ...Markup.keyboard([
              ['🛍 Daftar Produk', '💰 Saldo Saya'],
              ['📦 Pesanan Saya', '📞 Bantuan'],
            ]).resize(),
          }
        );
      }
    } catch (err) {
      console.error('start error:', err);
      ctx.reply('Terjadi kesalahan. Silakan coba lagi.');
    }
  });

  bot.hears('💰 Saldo Saya', async (ctx) => {
    try {
      const { rows: [user] } = await db.query(
        'SELECT balance FROM users WHERE telegram_id=$1',
        [ctx.from.id.toString()]
      );
      const saldo = user?.balance || 0;
      ctx.reply(
        `💰 *Saldo Kamu*\n\n` +
        `Rp *${Number(saldo).toLocaleString('id-ID')}*\n\n` +
        `_(Hubungi admin untuk top-up saldo)_`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('saldo error:', err);
      ctx.reply('Gagal mengambil saldo. Coba lagi.');
    }
  });

  bot.hears('📞 Bantuan', (ctx) => {
    ctx.reply(
      '📞 *Bantuan & Support*\n\n' +
      '• Hubungi admin jika ada masalah pesanan\n' +
      `• Admin: @${process.env.ADMIN_USERNAME || 'admin'}\n\n` +
      '📌 *FAQ:*\n' +
      '- Produk dikirim otomatis setelah pembayaran berhasil\n' +
      '- Format akun: email:password\n' +
      '- Pembayaran via Midtrans (transfer bank, QRIS, dll)\n\n' +
      '⚠️ Sertakan ID pesanan saat menghubungi admin.',
      { parse_mode: 'Markdown' }
    );
  });
};