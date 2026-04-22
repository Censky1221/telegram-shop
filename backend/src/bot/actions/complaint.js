module.exports = (bot) => {

  // tombol klik "Laporkan Masalah"
  bot.action(/lapor_(.+)/, async (ctx) => {
    const orderId = ctx.match[1];

    await ctx.reply(
`📋 Buat Laporan — Kategori Masalah

Pilih kategori:
1. Email & password salah
2. Akun disable
3. Akun backfree
4. Masalah lainnya`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Email & Password Salah", callback_data: `complaint_${orderId}_1` }],
            [{ text: "Akun Disable", callback_data: `complaint_${orderId}_2` }],
            [{ text: "Akun Backfree", callback_data: `complaint_${orderId}_3` }],
            [{ text: "Masalah Lainnya", callback_data: `complaint_${orderId}_4` }],
          ]
        }
      }
    );
  });

  // kirim ke admin
  bot.action(/complaint_(.+)_(\d+)/, async (ctx) => {
    const orderId = ctx.match[1];
    const kategori = ctx.match[2];

    const { pool } = require('../../db/pool');
    const { getBotByTenantId } = require('../tenantManager');

    const { rows: [order] } = await pool.query(
      `SELECT * FROM orders WHERE id=$1`,
      [orderId]
    );

    if (!order) return;

    const { rows: [tenant] } = await pool.query(
      `SELECT admin_telegram_id FROM tenants WHERE id=$1`,
      [order.tenant_id]
    );

    const adminId = tenant?.admin_telegram_id;
    if (!adminId) return;

    const kategoriText = {
      1: "Email & Password Salah",
      2: "Akun Disable",
      3: "Akun Backfree",
      4: "Masalah Lainnya"
    };

    const botInstance = getBotByTenantId(order.tenant_id);

    await botInstance.telegram.sendMessage(
      adminId,
`🚨 LAPORAN MASUK

🧾 Order: #${orderId}
📌 Masalah: ${kategoriText[kategori]}

Klik tombol di bawah untuk kirim akun pengganti`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Kirim Akun Pengganti", callback_data: `replace_${orderId}` }]
          ]
        }
      }
    );

    await ctx.answerCbQuery("Laporan dikirim ke admin!");
  });

};

bot.action(/replace_(.+)/, async (ctx) => {
  const orderId = ctx.match[1];

  const { pool } = require('../../db/pool');
  const { replaceAccount } = require('../../services/stockService');

  const { rows: [order] } = await pool.query(
    `SELECT tenant_id FROM orders WHERE id=$1`,
    [orderId]
  );

  if (!order) return;

  await replaceAccount(orderId, order.tenant_id);

  await ctx.answerCbQuery("Akun pengganti dikirim!");
});