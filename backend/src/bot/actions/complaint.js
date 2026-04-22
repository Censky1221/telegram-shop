const { pool } = require('../../db/pool');

module.exports = (bot) => {

  // =========================
  // CLICK BUTTON "LAPORKAN MASALAH"
  // =========================
  bot.action(/complaint_(\d+)/, async (ctx) => {
    try {
      const orderId = ctx.match[1];

      await ctx.answerCbQuery();

      // ambil akun yang dikirim ke user
      const { rows: stocks } = await pool.query(
        `SELECT id, email 
         FROM stocks 
         WHERE order_id=$1 AND status='sold'`,
        [orderId]
      );

      if (stocks.length === 0) {
        return ctx.reply("❌ Tidak ada akun ditemukan.");
      }

      // buat tombol pilihan akun
      const buttons = stocks.map((s, i) => [
        {
          text: `Akun ${i + 1} (${s.email})`,
          callback_data: `complaint_select_${s.id}_${orderId}`
        }
      ]);

      await ctx.reply(
        "⚠️ Pilih akun yang bermasalah:",
        {
          reply_markup: {
            inline_keyboard: buttons
          }
        }
      );

    } catch (err) {
      console.error(err);
    }
  });

  // =========================
  // PILIH AKUN ERROR
  // =========================
  bot.action(/complaint_select_(\d+)_(\d+)/, async (ctx) => {
    try {
      const stockId = ctx.match[1];
      const orderId = ctx.match[2];

      await ctx.answerCbQuery();

      // tandai akun sebagai error
      await pool.query(
        `UPDATE stocks SET status='error' WHERE id=$1`,
        [stockId]
      );

      // ambil order
      const { rows: [order] } = await pool.query(
        `SELECT * FROM orders WHERE id=$1`,
        [orderId]
      );

      if (!order) {
        return ctx.reply("❌ Order tidak ditemukan.");
      }

      // =========================
      // 🔥 AMBIL AKUN PENGGANTI
      // =========================
      const { rows: [replacement] } = await pool.query(
        order.variant_id
          ? `SELECT id, email, password FROM stocks 
             WHERE variant_id=$1 AND status='available' AND tenant_id=$2 LIMIT 1`
          : `SELECT id, email, password FROM stocks 
             WHERE product_id=$1 AND variant_id IS NULL AND status='available' AND tenant_id=$2 LIMIT 1`,
        order.variant_id
          ? [order.variant_id, order.tenant_id]
          : [order.product_id, order.tenant_id]
      );

      if (!replacement) {
        return ctx.reply("⚠️ Stok pengganti habis, admin akan segera membantu.");
      }

      // update jadi sold
      await pool.query(
        `UPDATE stocks SET status='sold', order_id=$1 WHERE id=$2`,
        [orderId, replacement.id]
      );

      // =========================
      // KIRIM KE USER
      // =========================
      await ctx.reply(
`✅ Akun pengganti berhasil dikirim:

Email    : ${replacement.email}
Password : ${replacement.password}`
      );

      // =========================
      // NOTIF ADMIN
      // =========================
      const { rows: [t] } = await pool.query(
        `SELECT admin_telegram_id FROM tenants WHERE id=$1`,
        [order.tenant_id]
      );

      if (t?.admin_telegram_id) {
        await ctx.telegram.sendMessage(
          t.admin_telegram_id,
`⚠️ Replacement Akun

Order: #${orderId}
Stock ID Error: ${stockId}
Diganti dengan: ${replacement.email}`
        );
      }

    } catch (err) {
      console.error(err);
    }
  });

};