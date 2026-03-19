const { Markup } = require('telegraf');
const axios      = require('axios');
const { pool }   = require('../db/pool');
const QRCode     = require('qrcode');

const PAGE_SIZE      = 9;
const userProductMap = {};
const userCart       = {};
const PAKASIR_URL    = 'https://app.pakasir.com/api';

module.exports = function registerHandlers(bot, tenant) {
  const tenantId = tenant.id;

  // ── /start ────────────────────────────────────────────────
  bot.start(async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const username   = ctx.from.username || null;
    const firstName  = ctx.from.first_name || 'User';

    try {
      await pool.query(
        `INSERT INTO users (telegram_id, username, first_name, balance, tenant_id)
         VALUES ($1, $2, $3, 0, $4)
         ON CONFLICT (telegram_id, tenant_id) DO UPDATE
           SET username = EXCLUDED.username, first_name = EXCLUDED.first_name`,
        [telegramId, username, firstName, tenantId]
      );
    } catch (err) {
      console.error('start insert error:', err.message);
    }

    await ctx.reply(
      `🏪 *Selamat datang di ${tenant.name}!*\n\n` +
      `👤 Halo, *${firstName}*!\n\n` +
      `Pilih menu di bawah untuk mulai berbelanja. 🛍`,
      {
        parse_mode: 'Markdown',
        ...Markup.keyboard([
          ['🛍 Daftar Produk', '💰 Saldo Saya'],
          ['📦 Pesanan Saya',  '📞 Bantuan'],
        ]).resize(),
      }
    );
  });

  // ── Saldo Saya ────────────────────────────────────────────
  bot.hears('💰 Saldo Saya', async (ctx) => {
    try {
      const { rows: [user] } = await pool.query(
        'SELECT balance FROM users WHERE telegram_id=$1 AND tenant_id=$2',
        [ctx.from.id.toString(), tenantId]
      );
      const saldo = user?.balance || 0;
      ctx.reply(
        `💰 *Saldo Kamu*\n\nRp *${Number(saldo).toLocaleString('id-ID')}*\n\n_(Hubungi admin untuk top-up)_`,
        { parse_mode: 'Markdown' }
      );
    } catch {
      ctx.reply('Gagal mengambil saldo.');
    }
  });

  // ── Bantuan ───────────────────────────────────────────────
  bot.hears('📞 Bantuan', (ctx) => {
    ctx.reply(
      `📞 *Bantuan & Support*\n\n` +
      `Hubungi admin ${tenant.name} jika ada masalah.\n\n` +
      `• Produk dikirim otomatis setelah pembayaran\n` +
      `• Pembayaran via QRIS\n\n` +
      `⚠️ Sertakan ID pesanan saat menghubungi admin.`,
      { parse_mode: 'Markdown' }
    );
  });

  // ── Daftar Produk ─────────────────────────────────────────
  bot.hears('🛍 Daftar Produk', (ctx) => showProductList(ctx, 1));

  bot.hears('Selanjutnya ▶️', async (ctx) => {
    const key  = `${tenantId}_${ctx.from.id}`;
    const page = (userProductMap[key]?._page || 1) + 1;
    await showProductList(ctx, page);
  });

  bot.hears('◀️ Sebelumnya', async (ctx) => {
    const key  = `${tenantId}_${ctx.from.id}`;
    const page = Math.max(1, (userProductMap[key]?._page || 1) - 1);
    await showProductList(ctx, page);
  });

  bot.hears('🏠 Menu', async (ctx) => {
    await ctx.reply('Pilih menu:', Markup.keyboard([
      ['🛍 Daftar Produk', '💰 Saldo Saya'],
      ['📦 Pesanan Saya',  '📞 Bantuan'],
    ]).resize());
  });

  // ── User ketik nomor ──────────────────────────────────────
  bot.hears(/^(\d+)$/, async (ctx) => {
    const num        = ctx.message.text;
    const productKey = `${tenantId}_${ctx.from.id}`;

    if (userProductMap[productKey]?.[num]) {
      await showProductDetail(ctx, userProductMap[productKey][num], 1);
    }
  });

  // ── Quantity +/- ──────────────────────────────────────────
  bot.action(/^qty_(plus|minus)_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    const dir       = ctx.match[1];
    const productId = parseInt(ctx.match[2]);
    const cartKey   = `${tenantId}_${ctx.from.id}`;

    if (!userCart[cartKey] || userCart[cartKey].productId !== productId) {
      userCart[cartKey] = { productId, qty: 1 };
    }
    const cart = userCart[cartKey];

    const { rows: [p] } = await pool.query(
      `SELECT COUNT(s.id) FILTER (WHERE s.status='available') AS stock_count
       FROM products p
       LEFT JOIN stocks s ON s.product_id = p.id
       WHERE p.id=$1 AND p.tenant_id=$2
       GROUP BY p.id`,
      [productId, tenantId]
    );
    const maxStock = parseInt(p?.stock_count || 0);

    if (dir === 'plus'  && cart.qty < maxStock) cart.qty++;
    if (dir === 'minus' && cart.qty > 1)        cart.qty--;

    try {
      await ctx.editMessageReplyMarkup(
        buildProductKeyboard(productId, cart.qty, maxStock > 0).reply_markup
      );
    } catch {}
  });

  // ── Beli Sekarang ─────────────────────────────────────────
  bot.action(/^buy_p_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    const productId = parseInt(ctx.match[1]);
    const cartKey   = `${tenantId}_${ctx.from.id}`;
    const qty       = userCart[cartKey]?.qty || 1;

    const { rows: [product] } = await pool.query(
      `SELECT * FROM products WHERE id=$1 AND tenant_id=$2 AND is_active=true`,
      [productId, tenantId]
    );
    if (!product) return ctx.answerCbQuery('Produk tidak ditemukan.', { show_alert: true });

    const total = product.price * qty;

    const text =
      `💳 *Pilih Metode Pembayaran*\n\n` +
      `📦 ${product.name} x${qty}\n` +
      `💰 Total: *Rp ${Number(total).toLocaleString('id-ID')}*\n\n` +
      `Pilih metode bayar:`;

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('💳 Bayar via QRIS/Transfer', `pay_qris_p_${productId}_${qty}`)],
        [Markup.button.callback('💰 Bayar via Saldo',         `pay_saldo_p_${productId}_${qty}`)],
        [Markup.button.callback('❌ Batal', 'cancel_buy')],
      ]),
    }).catch(() => {});
  });

  // ── Bayar via Saldo ───────────────────────────────────────
  bot.action(/^pay_saldo_p_(\d+)_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    const productId  = parseInt(ctx.match[1]);
    const qty        = parseInt(ctx.match[2]);
    const telegramId = ctx.from.id.toString();

    try {
      const { rows: [user] } = await pool.query(
        'SELECT id, balance FROM users WHERE telegram_id=$1 AND tenant_id=$2',
        [telegramId, tenantId]
      );
      if (!user) return ctx.editMessageText('Silakan kirim /start terlebih dahulu.').catch(() => {});

      const { rows: [product] } = await pool.query(
        `SELECT * FROM products WHERE id=$1 AND tenant_id=$2 AND is_active=true`,
        [productId, tenantId]
      );
      if (!product) return ctx.editMessageText('Produk tidak ditemukan.').catch(() => {});

      const total = product.price * qty;

      if ((user.balance || 0) < total) {
        return ctx.editMessageText(
          `❌ *Saldo tidak cukup!*\n\n` +
          `💰 Saldo kamu: *Rp ${Number(user.balance || 0).toLocaleString('id-ID')}*\n` +
          `🧾 Total bayar: *Rp ${Number(total).toLocaleString('id-ID')}*\n\n` +
          `Hubungi admin untuk top-up saldo.`,
          { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'cancel_buy')]]) }
        ).catch(() => {});
      }

      const { rows: [sc] } = await pool.query(
        `SELECT COUNT(*) AS cnt FROM stocks WHERE product_id=$1 AND tenant_id=$2 AND status='available'`,
        [productId, tenantId]
      );
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
            [Markup.button.callback('✅ Ya, Bayar Sekarang', `confirm_saldo_p_${productId}_${qty}`)],
            [Markup.button.callback('❌ Batal', 'cancel_buy')],
          ]),
        }
      ).catch(() => {});
    } catch (err) {
      console.error('pay_saldo_p error:', err);
      ctx.editMessageText('Terjadi kesalahan. Coba lagi.').catch(() => {});
    }
  });

  // ── Konfirmasi Saldo ──────────────────────────────────────
  bot.action(/^confirm_saldo_p_(\d+)_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery('Memproses...'); } catch {}
    const productId  = parseInt(ctx.match[1]);
    const qty        = parseInt(ctx.match[2]);
    const telegramId = ctx.from.id.toString();

    await ctx.editMessageText('⏳ Memproses pembayaran...').catch(() => {});

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [user] } = await client.query(
        'SELECT id, balance FROM users WHERE telegram_id=$1 AND tenant_id=$2 FOR UPDATE',
        [telegramId, tenantId]
      );
      const { rows: [product] } = await client.query(
        `SELECT * FROM products WHERE id=$1 AND tenant_id=$2`,
        [productId, tenantId]
      );

      const total = product.price * qty;
      if ((user.balance || 0) < total) {
        await client.query('ROLLBACK');
        return ctx.editMessageText('❌ Saldo tidak cukup.').catch(() => {});
      }

      await client.query('UPDATE users SET balance = balance - $1 WHERE id=$2', [total, user.id]);

      const { rows: [order] } = await client.query(
        `INSERT INTO orders (user_id, product_id, payment_id, amount, status, qty, paid_at, tenant_id)
         VALUES ($1,$2,$3,$4,'paid',$5,NOW(),$6) RETURNING *`,
        [user.id, productId, `SALDO-${Date.now()}`, total, qty, tenantId]
      );

      await client.query('COMMIT');

      await ctx.editMessageText(
        `✅ *Pembayaran Berhasil!*\n\n` +
        `📦 ${product.name} x${qty}\n` +
        `💰 Total: *Rp ${Number(total).toLocaleString('id-ID')}*\n\n` +
        `📨 Akun sedang dikirim ke chat ini...`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});

      const { assignStockAndDeliver } = require('../services/stockService');
      for (let i = 0; i < qty; i++) {
        await assignStockAndDeliver(order, tenantId);
      }

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('confirm_saldo_p error:', err);
      ctx.editMessageText('❌ Terjadi kesalahan. Hubungi admin.').catch(() => {});
    } finally {
      client.release();
    }
  });

  // ── Bayar via QRIS ────────────────────────────────────────
  bot.action(/^pay_qris_p_(\d+)_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    const productId  = parseInt(ctx.match[1]);
    const qty        = parseInt(ctx.match[2]);
    const telegramId = ctx.from.id.toString();

    try {
      const { rows: [user] } = await pool.query(
        'SELECT id FROM users WHERE telegram_id=$1 AND tenant_id=$2',
        [telegramId, tenantId]
      );
      if (!user) return ctx.editMessageText('Silakan kirim /start terlebih dahulu.').catch(() => {});

      const { rows: [product] } = await pool.query(
        `SELECT * FROM products WHERE id=$1 AND tenant_id=$2 AND is_active=true`,
        [productId, tenantId]
      );
      if (!product) return ctx.editMessageText('Produk tidak ditemukan.').catch(() => {});

      const { rows: [sc] } = await pool.query(
        `SELECT COUNT(*) AS cnt FROM stocks WHERE product_id=$1 AND tenant_id=$2 AND status='available'`,
        [productId, tenantId]
      );
      if (parseInt(sc.cnt) < qty)
        return ctx.editMessageText(`Stok tidak cukup. Tersedia: ${sc.cnt} akun.`).catch(() => {});

      // Cek pesanan pending
      const { rows: [existing] } = await pool.query(
        `SELECT id, payment_url FROM orders
         WHERE user_id=$1 AND product_id=$2 AND status='pending' AND tenant_id=$3
           AND created_at > NOW() - INTERVAL '2 hours'`,
        [user.id, productId, tenantId]
      );
      if (existing) {
        const isQrisString = existing.payment_url && !existing.payment_url.startsWith('http');
        if (isQrisString) {
          try {
            const qrBuffer = await QRCode.toBuffer(existing.payment_url, { type: 'png', width: 512, margin: 2 });
            await ctx.deleteMessage().catch(() => {});
            await ctx.replyWithPhoto({ source: qrBuffer }, {
              caption: `⚠️ Kamu masih punya pesanan yang belum dibayar.\n\nScan QR untuk melanjutkan pembayaran.`,
              parse_mode: 'Markdown',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('✅ Saya Sudah Bayar', `check_pakasir_${existing.id}`)],
                [Markup.button.callback('❌ Batal', 'cancel_buy')],
              ])
            });
          } catch {
            return ctx.editMessageText(
              `⚠️ Pesanan pending.\n\n\`${existing.payment_url}\``,
              {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                  [Markup.button.callback('✅ Sudah Bayar', `check_pakasir_${existing.id}`)],
                  [Markup.button.callback('❌ Batal', 'cancel_buy')],
                ])
              }
            ).catch(() => {});
          }
          return;
        }
      }

      const total          = product.price * qty;
      const paymentOrderId = `ORDER-${Date.now()}-${user.id}`;

      const { rows: [tenantConfig] } = await pool.query(
        `SELECT tripay_api_key, tripay_private_key, tripay_merchant_code, tripay_mode,
                pakasir_api_key, pakasir_project_slug, payment_gateway
         FROM tenants WHERE id=$1`,
        [tenantId]
      );

      const gateway = tenantConfig?.payment_gateway || 'tripay';

      if (gateway === 'pakasir' && !tenantConfig?.pakasir_api_key)
        return ctx.editMessageText('❌ Pakasir belum dikonfigurasi.').catch(() => {});
      if (gateway === 'tripay' && !tenantConfig?.tripay_api_key)
        return ctx.editMessageText('❌ Payment gateway belum dikonfigurasi.').catch(() => {});

      const { createPayment } = require('../services/paymentService');
      const config = gateway === 'pakasir'
        ? { gateway: 'pakasir', api_key: tenantConfig.pakasir_api_key, project_slug: tenantConfig.pakasir_project_slug }
        : { gateway: 'tripay', api_key: tenantConfig.tripay_api_key, private_key: tenantConfig.tripay_private_key, merchant_code: tenantConfig.tripay_merchant_code, mode: tenantConfig.tripay_mode || 'sandbox' };

      const result = await createPayment(config, {
        orderId     : paymentOrderId,
        amount      : total,
        productName : `${product.name} x${qty}`,
        customerName: ctx.from.first_name || 'Customer',
      });

      if (gateway === 'pakasir') {
        const { rows: [newOrder] } = await pool.query(
          `INSERT INTO orders (user_id, product_id, payment_id, payment_url, amount, status, qty, tenant_id)
           VALUES ($1,$2,$3,$4,$5,'pending',$6,$7) RETURNING id`,
          [user.id, productId, paymentOrderId, result.payment_number, total, qty, tenantId]
        );

        const expiredText = result.expired_at
          ? `⏰ Expired: *${new Date(result.expired_at).toLocaleString('id-ID')}*`
          : `⏰ Berlaku *2 jam*`;

        const caption =
          `🧾 *Pesanan Dibuat!*\n\n` +
          `📦 ${product.name} x${qty}\n` +
          `💰 Total: *Rp ${Number(result.total_payment || total).toLocaleString('id-ID')}*\n` +
          expiredText + `\n\n` +
          `📲 *Cara Bayar QRIS:*\n` +
          `1. Buka e-wallet (GoPay, OVO, Dana, dll)\n` +
          `2. Scan gambar QR di atas\n` +
          `3. Atau pilih *Salin Kode* jika tidak bisa scan`;

        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('📋 Salin Kode QRIS', `copy_qris_${newOrder.id}`)],
          [Markup.button.callback('✅ Saya Sudah Bayar', `check_pakasir_${newOrder.id}`)],
          [Markup.button.callback('❌ Batal', 'cancel_buy')],
        ]);

        try {
          const qrBuffer = await QRCode.toBuffer(result.payment_number, { type: 'png', width: 512, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
          await ctx.deleteMessage().catch(() => {});
          const sentMsg = await ctx.replyWithPhoto({ source: qrBuffer }, { caption, parse_mode: 'Markdown', ...keyboard });
          if (sentMsg?.message_id) {
            await pool.query(`UPDATE orders SET chat_id=$1, message_id=$2 WHERE id=$3`, [sentMsg.chat.id, sentMsg.message_id, newOrder.id]);
          }
        } catch (qrErr) {
          console.error('QR generate error:', qrErr);
          await ctx.deleteMessage().catch(() => {});
          await ctx.reply(caption + `\n\n📋 *Kode QRIS:*\n\`${result.payment_number}\``, { parse_mode: 'Markdown', ...keyboard }).catch(() => {});
        }

      } else {
        await pool.query(
          `INSERT INTO orders (user_id, product_id, payment_id, payment_url, amount, status, qty, tenant_id)
           VALUES ($1,$2,$3,$4,$5,'pending',$6,$7)`,
          [user.id, productId, paymentOrderId, result.payment_url, total, qty, tenantId]
        );
        await ctx.editMessageText(
          `🧾 *Pesanan Dibuat!*\n\n📦 ${product.name} x${qty}\n💰 Total: *Rp ${Number(total).toLocaleString('id-ID')}*\n\nKlik tombol di bawah untuk membayar.\n⏰ Link berlaku *2 jam*.`,
          { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.url('💳 Bayar Sekarang', result.payment_url)]]) }
        ).catch(() => {});
      }

    } catch (err) {
      console.error('pay_qris_p error:', err);
      ctx.editMessageText(`❌ Terjadi kesalahan: ${err.message}`).catch(() => {});
    }
  });

  // ── Salin Kode QRIS ──────────────────────────────────────
  bot.action(/^copy_qris_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    const orderId = parseInt(ctx.match[1]);
    try {
      const { rows: [order] } = await pool.query(
        `SELECT payment_url FROM orders WHERE id=$1 AND tenant_id=$2`,
        [orderId, tenantId]
      );
      if (!order) return ctx.answerCbQuery('Pesanan tidak ditemukan.', { show_alert: true });
      await ctx.reply(
        `📋 *Kode QRIS:*\n\n\`${order.payment_url}\`\n\n_Paste kode ini di e-wallet kamu._`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('copy_qris error:', err.message);
    }
  });

  // ── Cek Pembayaran Pakasir ────────────────────────────────
  bot.action(/^check_pakasir_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery('Mengecek pembayaran...'); } catch {}
    const orderId = parseInt(ctx.match[1]);

    try {
      const { rows: [order] } = await pool.query(
        `SELECT o.*, u.telegram_id FROM orders o
         JOIN users u ON u.id = o.user_id
         WHERE o.id=$1 AND o.tenant_id=$2`,
        [orderId, tenantId]
      );
      if (!order) return ctx.answerCbQuery('Pesanan tidak ditemukan.', { show_alert: true });
      if (order.status === 'paid') return ctx.answerCbQuery('✅ Pesanan ini sudah dibayar!', { show_alert: true });

      const { rows: [tenantConfig] } = await pool.query(
        `SELECT pakasir_api_key, pakasir_project_slug FROM tenants WHERE id=$1`,
        [tenantId]
      );

      let checkResp;
      const endpoints = [
        `${PAKASIR_URL}/transactionstatus`,
        `${PAKASIR_URL}/transaction/check`,
        `${PAKASIR_URL}/transaction/status`,
        `${PAKASIR_URL}/transactioncheck`,
      ];
      for (const endpoint of endpoints) {
        try {
          checkResp = await axios.post(endpoint, {
            project : tenantConfig.pakasir_project_slug,
            order_id: order.payment_id,
            api_key : tenantConfig.pakasir_api_key,
          }, { headers: { 'Content-Type': 'application/json' } });
          break;
        } catch { checkResp = null; }
      }

      if (!checkResp) return ctx.answerCbQuery('❌ Tidak dapat cek status pembayaran.', { show_alert: true });

      const paymentData = checkResp.data?.payment || checkResp.data;
      const isPaid = paymentData?.status === 'paid' || paymentData?.payment_status === 'paid' || paymentData?.is_paid === true || paymentData?.paid === true;

      if (!isPaid) return ctx.answerCbQuery('❌ Pembayaran belum diterima. Coba lagi.', { show_alert: true });

      await pool.query(`UPDATE orders SET status='paid', paid_at=NOW() WHERE id=$1 AND tenant_id=$2`, [orderId, tenantId]);

      await ctx.editMessageCaption(
        `✅ *Pembayaran Diterima!*\n\n📨 Akun sedang dikirim ke chat ini...`,
        { parse_mode: 'Markdown' }
      ).catch(() =>
        ctx.editMessageText(`✅ *Pembayaran Diterima!*\n\n📨 Akun sedang dikirim...`, { parse_mode: 'Markdown' }).catch(() => {})
      );

      const { assignStockAndDeliver } = require('../services/stockService');
      for (let i = 0; i < order.qty; i++) {
        await assignStockAndDeliver(order, tenantId);
      }

    } catch (err) {
      console.error('check_pakasir error:', err);
      ctx.answerCbQuery(`Gagal cek pembayaran: ${err.message}`, { show_alert: true });
    }
  });

  // ── Cancel ────────────────────────────────────────────────
  bot.action('cancel_buy', async (ctx) => {
    try { await ctx.answerCbQuery('Dibatalkan'); } catch {}
    try {
      const telegramId = ctx.from.id.toString();
      const { rows: [user] } = await pool.query(
        'SELECT id FROM users WHERE telegram_id=$1 AND tenant_id=$2',
        [telegramId, tenantId]
      );
      if (user) {
        await pool.query(
          `DELETE FROM orders WHERE user_id=$1 AND tenant_id=$2 AND status='pending'`,
          [user.id, tenantId]
        );
      }
    } catch (err) {
      console.error('cancel_buy error:', err.message);
    }
    await ctx.deleteMessage().catch(() => {});
  });

  bot.action('back_to_list', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    const key  = `${tenantId}_${ctx.from.id}`;
    const page = userProductMap[key]?._page || 1;
    await showProductList(ctx, page);
  });

  bot.action('no_stock', (ctx) => ctx.answerCbQuery('Stok sedang habis.', { show_alert: true }));
  bot.action('qty_noop', (ctx) => { try { ctx.answerCbQuery(); } catch {} });

  // ─────────────────────────────────────────────────────────
  // HELPER FUNCTIONS
  // ─────────────────────────────────────────────────────────

  // Daftar Produk — nama + stok
  async function showProductList(ctx, page) {
    try {
      const { rows: allProducts } = await pool.query(
        `SELECT p.id, p.name,
                COUNT(s.id) FILTER (WHERE s.status='available') AS stock_count
         FROM products p
         LEFT JOIN stocks s ON s.product_id = p.id
         WHERE p.is_active=true AND p.tenant_id=$1
         GROUP BY p.id
         ORDER BY p.id`,
        [tenantId]
      );

      if (!allProducts.length) {
        return ctx.reply('Tidak ada produk tersedia saat ini.', Markup.keyboard([['🏠 Menu']]).resize());
      }

      const totalPages = Math.ceil(allProducts.length / PAGE_SIZE);
      const safePage   = Math.min(Math.max(page, 1), totalPages);
      const start      = (safePage - 1) * PAGE_SIZE;
      const pageItems  = allProducts.slice(start, start + PAGE_SIZE);

      const key = `${tenantId}_${ctx.from.id}`;
      userProductMap[key] = { _page: safePage };
      pageItems.forEach((p, i) => { userProductMap[key][String(start + i + 1)] = p.id; });

      const listText = pageItems.map((p, i) => {
        const stock = parseInt(p.stock_count);
        const icon  = stock > 0 ? '✅' : '❌';
        return `${icon} [${start + i + 1}] ${p.name} (${stock})`;
      }).join('\n');

      const keyRows = [];
      const numKeys = pageItems.map((_, i) => String(start + i + 1));
      for (let i = 0; i < numKeys.length; i += 6)
        keyRows.push(numKeys.slice(i, i + 6).map(n => Markup.button.text(n)));

      const navRow = [];
      if (safePage > 1)          navRow.push(Markup.button.text('◀️ Sebelumnya'));
      if (safePage < totalPages) navRow.push(Markup.button.text('Selanjutnya ▶️'));
      navRow.push(Markup.button.text('🏠 Menu'));
      keyRows.push(navRow);

      await ctx.reply(
        `╭------------------- ╮\n` +
        `┊   LIST PRODUK        \n` +
        `┊   page ${safePage} / ${totalPages}              \n` +
        `┊---------------------\n` +
        `${pageItems.map((p, i) => {
          const stock = parseInt(p.stock_count);
          const icon  = stock > 0 ? '✅' : '❌';
          return `│ ${icon} [${start + i + 1}] ${p.name} (${stock})`;
        }).join('\n')}\n` +
        `╰------------------- ╯\n\n` +
        `Masukkan nomor untuk melihat detail.`,
        { parse_mode: 'Markdown', ...Markup.keyboard(keyRows).resize() }
   );
    } catch (err) {
      console.error('showProductList error:', err);
      ctx.reply('Gagal memuat produk.');
    }
  }

  // Detail Produk — qty picker + beli sekarang
  async function showProductDetail(ctx, productId, qty = 1) {
    try {
      const { rows: [product] } = await pool.query(
        `SELECT p.*,
                COUNT(s.id) FILTER (WHERE s.status='available') AS stock_count
         FROM products p
         LEFT JOIN stocks s ON s.product_id = p.id
         WHERE p.id=$1 AND p.tenant_id=$2 AND p.is_active=true
         GROUP BY p.id`,
        [productId, tenantId]
      );
      if (!product) return ctx.reply('Produk tidak ditemukan.');

      const stock   = parseInt(product.stock_count);
      const inStock = stock > 0;
      const cartKey = `${tenantId}_${ctx.from.id}`;
      userCart[cartKey] = { productId, qty };

      const text =
        `🏷 *${product.name}*\n\n` +
        `📝 ${product.description || 'Tidak ada deskripsi.'}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💰 Harga: *Rp ${Number(product.price).toLocaleString('id-ID')}* / akun\n` +
        `📦 Stok: ${inStock ? `*${stock} tersedia* ✅` : '*Habis* ❌'}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Atur jumlah lalu tekan *Beli Sekarang*`;

      await ctx.reply(text, { parse_mode: 'Markdown', ...buildProductKeyboard(productId, qty, inStock) });
    } catch (err) {
      console.error('showProductDetail error:', err);
      ctx.reply('Gagal memuat detail produk.');
    }
  }

  function buildProductKeyboard(productId, qty, inStock) {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('➖', `qty_minus_${productId}`),
        Markup.button.callback(`  ${qty}  `, 'qty_noop'),
        Markup.button.callback('➕', `qty_plus_${productId}`),
      ],
      inStock
        ? [Markup.button.callback(`🛒 Beli ${qty > 1 ? '(x' + qty + ')' : ''} Sekarang`, `buy_p_${productId}`)]
        : [Markup.button.callback('❌ Stok Habis', 'no_stock')],
      [Markup.button.callback('◀️ Kembali ke Daftar', 'back_to_list')],
    ]);
  }
};