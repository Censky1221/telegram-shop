const { Markup } = require('telegraf');
const db = require('../../db/pool');
const { createPayment } = require('../../services/paymentService');
const { assignStockAndDeliver } = require('../../services/stockService');

module.exports = (bot) => {

  // ── Bayar via QRIS/Transfer (Midtrans) ─────────────────────
  bot.action(/^pay_qris_(\d+)_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    const productId  = parseInt(ctx.match[1]);
    const qty        = parseInt(ctx.match[2]);
    const telegramId = ctx.from.id;

    try {
      const { rows: [user] } = await db.query(
        'SELECT id FROM users WHERE telegram_id=$1', [telegramId]);
      if (!user) return ctx.editMessageText('Silakan kirim /start terlebih dahulu.').catch(() => ctx.reply('Silakan kirim /start terlebih dahulu.'));

      const { rows: [product] } = await db.query(
        'SELECT * FROM products WHERE id=$1 AND is_active=true', [productId]);
      if (!product) return ctx.editMessageText('Produk tidak ditemukan.').catch(() => {});

      const { rows: [sc] } = await db.query(
        `SELECT COUNT(*) AS cnt FROM stocks WHERE product_id=$1 AND status='available'`,
        [productId]);
      if (parseInt(sc.cnt) < qty)
        return ctx.editMessageText(`Stok tidak cukup. Tersedia: ${sc.cnt} akun.`).catch(() => {});

      const { rows: [existing] } = await db.query(
        `SELECT id, payment_url FROM orders
         WHERE user_id=$1 AND product_id=$2 AND status='pending'
           AND created_at > NOW() - INTERVAL '2 hours'`,
        [user.id, productId]);
      if (existing) {
        return ctx.editMessageText(
          '⚠️ Kamu masih punya pesanan yang belum dibayar.',
          Markup.inlineKeyboard([[Markup.button.url('💳 Bayar Sekarang', existing.payment_url)]])
        ).catch(() => {});
      }

      const total          = product.price * qty;
      const paymentOrderId = `ORDER-${Date.now()}-${user.id}`;
      const paymentUrl     = await createPayment({
        orderId: paymentOrderId, amount: total,
        productName: `${product.name} x${qty}`,
        customerName: ctx.from.first_name || 'Customer',
      });

      await db.query(
        `INSERT INTO orders (user_id, product_id, payment_id, payment_url, amount, status, qty)
         VALUES ($1,$2,$3,$4,$5,'pending',$6)`,
        [user.id, productId, paymentOrderId, paymentUrl, total, qty]
      );

      await ctx.editMessageText(
        `🧾 *Pesanan Dibuat!*\n\n` +
        `📦 ${product.name} x${qty}\n` +
        `💰 Total: *Rp ${Number(total).toLocaleString('id-ID')}*\n\n` +
        `Klik tombol di bawah untuk membayar.\n` +
        `⏰ Link berlaku *2 jam*.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.url('💳 Bayar Sekarang', paymentUrl)]]),
        }
      );
    } catch (err) {
      console.error('pay_qris error:', err);
      ctx.editMessageText('Terjadi kesalahan. Coba lagi.').catch(() => {});
    }
  });

  // ── Bayar via Saldo ─────────────────────────────────────────
  bot.action(/^pay_saldo_(\d+)_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    const productId  = parseInt(ctx.match[1]);
    const qty        = parseInt(ctx.match[2]);
    const telegramId = ctx.from.id;

    try {
      const { rows: [user] } = await db.query(
        'SELECT id, balance FROM users WHERE telegram_id=$1', [telegramId]);
      if (!user) return ctx.editMessageText('Silakan kirim /start terlebih dahulu.').catch(() => {});

      const { rows: [product] } = await db.query(
        'SELECT * FROM products WHERE id=$1 AND is_active=true', [productId]);
      if (!product) return ctx.editMessageText('Produk tidak ditemukan.').catch(() => {});

      const total = product.price * qty;

      if ((user.balance || 0) < total) {
        return ctx.editMessageText(
          `❌ *Saldo tidak cukup!*\n\n` +
          `💰 Saldo kamu: *Rp ${Number(user.balance || 0).toLocaleString('id-ID')}*\n` +
          `🧾 Total bayar: *Rp ${Number(total).toLocaleString('id-ID')}*\n\n` +
          `Hubungi admin untuk top-up saldo.`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'cancel_buy')]]),
          }
        ).catch(() => {});
      }

      const { rows: [sc] } = await db.query(
        `SELECT COUNT(*) AS cnt FROM stocks WHERE product_id=$1 AND status='available'`,
        [productId]);
      if (parseInt(sc.cnt) < qty)
        return ctx.editMessageText(`Stok tidak cukup. Tersedia: ${sc.cnt} akun.`).catch(() => {});

      await ctx.editMessageText(
        `✅ *Konfirmasi Pembelian*\n\n` +
        `📦 ${product.name} x${qty}\n` +
        `💰 Total: *Rp ${Number(total).toLocaleString('id-ID')}*\n` +
        `💳 Saldo setelah bayar: *Rp ${Number((user.balance || 0) - total).toLocaleString('id-ID')}*\n\n` +
        `Lanjutkan?`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ Ya, Bayar Sekarang', `confirm_saldo_${productId}_${qty}`)],
            [Markup.button.callback('❌ Batal', 'cancel_buy')],
          ]),
        }
      );
    } catch (err) {
      console.error('pay_saldo error:', err);
      ctx.editMessageText('Terjadi kesalahan. Coba lagi.').catch(() => {});
    }
  });

  // ── Konfirmasi bayar saldo ──────────────────────────────────
  bot.action(/^confirm_saldo_(\d+)_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery('Memproses...'); } catch {}
    const productId  = parseInt(ctx.match[1]);
    const qty        = parseInt(ctx.match[2]);
    const telegramId = ctx.from.id;

    // Edit dulu jadi loading
    await ctx.editMessageText('⏳ Memproses pembayaran...').catch(() => {});

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [user] } = await client.query(
        'SELECT id, balance FROM users WHERE telegram_id=$1 FOR UPDATE', [telegramId]);
      const { rows: [product] } = await client.query(
        'SELECT * FROM products WHERE id=$1', [productId]);

      const total = product.price * qty;
      if ((user.balance || 0) < total) {
        await client.query('ROLLBACK');
        return ctx.editMessageText('❌ Saldo tidak cukup.').catch(() => {});
      }

      await client.query(
        'UPDATE users SET balance = balance - $1 WHERE id=$2',
        [total, user.id]
      );

      const { rows: [order] } = await client.query(
        `INSERT INTO orders (user_id, product_id, payment_id, amount, status, qty, paid_at)
         VALUES ($1,$2,$3,$4,'paid',$5,NOW()) RETURNING *`,
        [user.id, productId, `SALDO-${Date.now()}`, total, qty]
      );

      await client.query('COMMIT');

      // Edit pesan jadi sukses
      await ctx.editMessageText(
        `✅ *Pembayaran Berhasil!*\n\n` +
        `📦 ${product.name} x${qty}\n` +
        `💰 Total: *Rp ${Number(total).toLocaleString('id-ID')}*\n\n` +
        `📨 Akun sedang dikirim ke chat ini...`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});

      // Kirim stok (akun dikirim sebagai pesan terpisah — ini memang perlu pesan baru)
      for (let i = 0; i < qty; i++) {
        await assignStockAndDeliver(order);
      }

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('confirm_saldo error:', err);
      ctx.editMessageText('❌ Terjadi kesalahan. Hubungi admin.').catch(() => {});
    } finally {
      client.release();
    }
  });

  bot.action('cancel_buy', async (ctx) => {
    try { await ctx.answerCbQuery('Dibatalkan'); } catch {}
    await ctx.deleteMessage().catch(() => {});
  });

  bot.action('no_stock', (ctx) =>
    ctx.answerCbQuery('Stok sedang habis.', { show_alert: true }));
};