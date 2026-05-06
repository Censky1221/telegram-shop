// ============================================================
// Onboarding Flow Helper
// Menampilkan pesan sambutan bertahap untuk user baru
// ============================================================

const { Markup } = require('telegraf');

// Teks tiap step onboarding
const STEPS = [
  // Step 0 — Selamat Datang
  (tenantName, firstName) => ({
    text:
      `🎉 *Selamat Datang di ${tenantName}!*\n\n` +
      `Halo *${firstName}*! 👋\n\n` +
      `Kami adalah toko digital yang menjual berbagai produk premium dengan harga terjangkau.\n\n` +
      `🚀 Dalam beberapa langkah singkat, kami akan memandu kamu cara berbelanja di sini.\n\n` +
      `📌 Ketik /start kapan saja untuk kembali ke menu utama.`,
    buttons: [[Markup.button.callback('Lanjut ➡️', 'onboard_1')]],
  }),

  // Step 1 — Cara Melihat Produk
  () => ({
    text:
      `🛍 *Cara Melihat & Membeli Produk*\n\n` +
      `*1.* Tekan tombol *🛍 Daftar Produk* di menu bawah\n` +
      `*2.* Pilih produk yang kamu inginkan\n` +
      `*3.* Atur jumlah, lalu tekan *Beli Sekarang*\n` +
      `*4.* Pilih metode bayar:\n` +
      `   • 💳 *QRIS/Transfer* — bayar via Pakasir\n` +
      `   • 💰 *Saldo* — pakai saldo di akun kamu\n\n` +
      `✅ Setelah pembayaran dikonfirmasi, akun dikirim *otomatis* ke chat ini!`,
    buttons: [
      [Markup.button.callback('⬅️ Kembali', 'onboard_0'), Markup.button.callback('Lanjut ➡️', 'onboard_2')],
    ],
  }),

  // Step 2 — Voucher & Referral
  () => ({
    text:
      `🎟️ *Voucher & 💎 Referral*\n\n` +
      `*Voucher Diskon*\n` +
      `Tekan *🎟️ Pakai Voucher* saat di halaman produk, lalu ketik kode voucher untuk mendapat diskon.\n\n` +
      `*Program Referral*\n` +
      `• Buka menu *💎 Referral* untuk lihat link unikmu\n` +
      `• Bagikan link ke teman — setiap teman yang beli pertama kali, kamu otomatis dapat *bonus saldo*! 🎉\n` +
      `• Saldo bisa ditarik ke rekening / e-wallet kapan saja`,
    buttons: [
      [Markup.button.callback('⬅️ Kembali', 'onboard_1'), Markup.button.callback('Lanjut ➡️', 'onboard_3')],
    ],
  }),

  // Step 3 — Bantuan & Selesai
  (tenantName) => ({
    text:
      `📞 *Bantuan & Support*\n\n` +
      `Jika kamu mengalami masalah:\n` +
      `• Tekan *📞 Bantuan* di menu untuk info kontak admin\n` +
      `• Sertakan *ID Pesanan* (#nomor) saat menghubungi admin\n` +
      `• Produk biasanya dikirim *otomatis dalam hitungan detik* setelah pembayaran\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ Kamu sudah siap belanja di *${tenantName}*!\n\n` +
      `Tekan *Mulai Belanja* untuk melihat semua produk kami. 🚀`,
    buttons: [
      [Markup.button.callback('⬅️ Kembali', 'onboard_2'), Markup.button.callback('✅ Mulai Belanja!', 'onboard_done')],
    ],
  }),
];

/**
 * Kirim pesan onboarding step tertentu.
 * @param {Context} ctx - Telegraf context
 * @param {number}  step - Nomor step (0-3)
 * @param {object}  tenant - Objek tenant { name }
 * @param {string}  firstName - Nama depan user
 * @param {boolean} edit - true = editMessageText, false = reply baru
 */
async function sendOnboardingStep(ctx, step, tenant, firstName, edit = false) {
  const builder = STEPS[step];
  if (!builder) return;

  const { text, buttons } = builder(tenant.name, firstName);
  const progress = `_Langkah ${step + 1} dari ${STEPS.length}_\n\n`;
  const fullText = progress + text;

  const opts = {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons),
  };

  if (edit) {
    await ctx.editMessageText(fullText, opts).catch(async () => {
      await ctx.reply(fullText, opts);
    });
  } else {
    await ctx.reply(fullText, opts);
  }
}

module.exports = { sendOnboardingStep, STEPS };
