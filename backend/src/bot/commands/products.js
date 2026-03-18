const { Markup } = require('telegraf');
const db = require('../../db/pool');

const PAGE_SIZE = 9;
const userProductMap = {};
const userCart = {}; // { userId: { productId, qty } }

module.exports = (bot) => {
  bot.hears('🛍 Daftar Produk', (ctx) => showProductList(ctx, 1));
  bot.command('produk', (ctx) => showProductList(ctx, 1));

  bot.hears(/^(\d+)$/, async (ctx) => {
    const num    = ctx.message.text;
    const userId = ctx.from.id;
    const map    = userProductMap[userId];
    if (!map || !map[num]) return;
    await showProductDetail(ctx, map[num], 1);
  });

  bot.hears('Selanjutnya ▶️', async (ctx) => {
    const userId = ctx.from.id;
    const page   = (userProductMap[userId]?._page || 1) + 1;
    await showProductList(ctx, page);
  });
  bot.hears('◀️ Sebelumnya', async (ctx) => {
    const userId = ctx.from.id;
    const page   = Math.max(1, (userProductMap[userId]?._page || 1) - 1);
    await showProductList(ctx, page);
  });
  bot.hears('🏠 Menu', async (ctx) => {
    await ctx.reply('Pilih menu:', Markup.keyboard([
      ['🛍 Daftar Produk', '💰 Saldo Saya'],
      ['📦 Pesanan Saya',  '📞 Bantuan'],
    ]).resize());
  });

  // ── Quantity +/- buttons ────────────────────────────────────
  bot.action(/^qty_(plus|minus)_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    const dir       = ctx.match[1];
    const productId = parseInt(ctx.match[2]);
    const userId    = ctx.from.id;

    if (!userCart[userId] || userCart[userId].productId !== productId) {
      userCart[userId] = { productId, qty: 1 };
    }
    const cart = userCart[userId];

    const { rows: [p] } = await db.query(
      `SELECT COUNT(s.id) FILTER (WHERE s.status='available') AS stock_count
       FROM products p LEFT JOIN stocks s ON s.product_id=p.id
       WHERE p.id=$1 GROUP BY p.id`, [productId]
    );
    const maxStock = parseInt(p?.stock_count || 0);

    if (dir === 'plus'  && cart.qty < maxStock) cart.qty++;
    if (dir === 'minus' && cart.qty > 1)        cart.qty--;

    try {
      await ctx.editMessageReplyMarkup(
        buildDetailKeyboard(productId, cart.qty, maxStock > 0).reply_markup
      );
    } catch {}
  });

  // ── Pilih metode bayar ──────────────────────────────────────
  bot.action(/^buy_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    const productId = parseInt(ctx.match[1]);
    const userId    = ctx.from.id;
    const qty       = userCart[userId]?.qty || 1;

    const { rows: [product] } = await db.query(
      'SELECT * FROM products WHERE id=$1 AND is_active=true', [productId]
    );
    if (!product) return ctx.answerCbQuery('Produk tidak ditemukan.', { show_alert: true });

    const total = product.price * qty;

    // Edit pesan yang ada (caption jika foto, text jika teks biasa)
    const newText =
      `💳 *Pilih Metode Pembayaran*\n\n` +
      `📦 ${product.name} x${qty}\n` +
      `💰 Total: *Rp ${Number(total).toLocaleString('id-ID')}*\n\n` +
      `Pilih metode bayar:`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('💳 Bayar via QRIS/Transfer', `pay_qris_${productId}_${qty}`)],
      [Markup.button.callback('💰 Bayar via Saldo',         `pay_saldo_${productId}_${qty}`)],
      [Markup.button.callback('❌ Batal', 'cancel_buy')],
    ]);

    try {
      // Coba edit caption (jika pesan berisi foto)
      await ctx.editMessageCaption(newText, {
        parse_mode: 'Markdown',
        ...keyboard,
      });
    } catch {
      // Fallback: edit teks biasa
      await ctx.editMessageText(newText, {
        parse_mode: 'Markdown',
        ...keyboard,
      }).catch(() => {});
    }
  });

  bot.action('cancel_buy', async (ctx) => {
    try { await ctx.answerCbQuery('Dibatalkan'); } catch {}
    await ctx.deleteMessage().catch(() => {});
  });

  bot.action('back_to_list', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    const page = userProductMap[ctx.from.id]?._page || 1;
    await showProductList(ctx, page);
  });

  // ── Helper: build detail keyboard ──────────────────────────
  function buildDetailKeyboard(productId, qty, inStock) {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('➖', `qty_minus_${productId}`),
        Markup.button.callback(`  ${qty}  `, `qty_noop`),
        Markup.button.callback('➕', `qty_plus_${productId}`),
      ],
      inStock
        ? [Markup.button.callback(`🛒 Beli ${qty > 1 ? '(x'+qty+')' : ''} Sekarang`, `buy_${productId}`)]
        : [Markup.button.callback('❌ Stok Habis', 'no_stock')],
      [Markup.button.callback('◀️ Kembali ke Daftar', 'back_to_list')],
    ]);
  }

  bot.action('qty_noop', (ctx) => { try { ctx.answerCbQuery(); } catch {} });

  // ── Tampilkan daftar produk ─────────────────────────────────
  async function showProductList(ctx, page) {
    try {
      const { rows: allProducts } = await db.query(
        `SELECT p.id, p.name,
                COUNT(s.id) FILTER (WHERE s.status='available') AS stock_count
         FROM products p
         LEFT JOIN stocks s ON s.product_id=p.id
         WHERE p.is_active=true GROUP BY p.id ORDER BY p.id`
      );

      if (!allProducts.length) {
        return ctx.reply('Tidak ada produk tersedia saat ini. 🙏',
          Markup.keyboard([['🏠 Menu']]).resize());
      }

      const totalPages = Math.ceil(allProducts.length / PAGE_SIZE);
      const safePage   = Math.min(Math.max(page, 1), totalPages);
      const start      = (safePage - 1) * PAGE_SIZE;
      const pageItems  = allProducts.slice(start, start + PAGE_SIZE);

      const userId = ctx.from.id;
      userProductMap[userId] = { _page: safePage };
      pageItems.forEach((p, i) => {
        userProductMap[userId][String(start + i + 1)] = p.id;
      });

      const listText = pageItems.map((p, i) => {
        const num   = start + i + 1;
        const stock = parseInt(p.stock_count);
        return `${num}. ${p.name} — ${stock > 0 ? `✅ Stok ${stock}` : '❌ Habis'}`;
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

      const caption =
        `🛍 *Daftar Produk*\n\n${listText}\n\n` +
        `📄 Halaman ${safePage}/${totalPages}\n` +
        `Masukkan nomor untuk melihat detail.`;

      const bannerUrl = process.env.BANNER_URL ||
        'https://via.placeholder.com/1200x400/6366f1/ffffff?text=Daftar+Produk';

      try {
        await ctx.replyWithPhoto({ url: bannerUrl },
          { caption, parse_mode: 'Markdown', ...Markup.keyboard(keyRows).resize() });
      } catch {
        await ctx.reply(caption, { parse_mode: 'Markdown', ...Markup.keyboard(keyRows).resize() });
      }
    } catch (err) {
      console.error('showProductList error:', err);
      ctx.reply('Gagal memuat produk.');
    }
  }

  // ── Tampilkan detail produk ─────────────────────────────────
  async function showProductDetail(ctx, productId, qty = 1) {
    try {
      const { rows: [product] } = await db.query(
        `SELECT p.*, COUNT(s.id) FILTER (WHERE s.status='available') AS stock_count
         FROM products p LEFT JOIN stocks s ON s.product_id=p.id
         WHERE p.id=$1 AND p.is_active=true GROUP BY p.id`,
        [productId]
      );
      if (!product) return ctx.reply('Produk tidak ditemukan.');

      const stock   = parseInt(product.stock_count);
      const inStock = stock > 0;

      userCart[ctx.from.id] = { productId, qty };

      const text =
        `🏷 *${product.name}*\n\n` +
        `📝 ${product.description || 'Tidak ada deskripsi.'}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💰 Harga: *Rp ${Number(product.price).toLocaleString('id-ID')}* / akun\n` +
        `📦 Stok: ${inStock ? `*${stock} tersedia* ✅` : '*Habis* ❌'}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Atur jumlah lalu tekan *Beli Sekarang*`;

      const imgUrl = product.image_url || process.env.BANNER_URL ||
        'https://via.placeholder.com/800x400/6366f1/ffffff?text=Produk';

      try {
        await ctx.replyWithPhoto({ url: imgUrl },
          { caption: text, parse_mode: 'Markdown', ...buildDetailKeyboard(productId, qty, inStock) });
      } catch {
        await ctx.reply(text,
          { parse_mode: 'Markdown', ...buildDetailKeyboard(productId, qty, inStock) });
      }
    } catch (err) {
      console.error('showProductDetail error:', err);
      ctx.reply('Gagal memuat detail produk.');
    }
  }

  bot.action('no_stock', (ctx) => ctx.answerCbQuery('Stok sedang habis.', { show_alert: true }));
  bot.showProductDetail = showProductDetail;
};