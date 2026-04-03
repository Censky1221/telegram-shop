const { Markup } = require('telegraf');
const axios      = require('axios');
const { pool }   = require('../db/pool');
const QRCode     = require('qrcode');

const userProductMap = {};
const userCart       = {};
const userVoucherMap = {};
const PAKASIR_URL    = 'https://app.pakasir.com/api';

const MAIN_KEYBOARD = Markup.keyboard([
  ['🛍 Daftar Produk', '💰 Saldo Saya'],
  ['📦 Pesanan Saya',  '🎟️ Voucher'],
  ['📞 Bantuan'],
]).resize();

module.exports = function registerHandlers(bot, tenant) {
  const tenantId = tenant.id;

  // ── Notif admin ───────────────────────────────────────────
  async function notifyAdminOrder(order, productName, variantName, username, qty, total) {
    try {
      const { rows: [t] } = await pool.query(`SELECT admin_telegram_id FROM tenants WHERE id=$1`, [tenantId]);
      if (!t?.admin_telegram_id) return;
      const prodLabel = variantName ? `${productName} - ${variantName}` : productName;
      const userLabel = username ? `@${username}` : `ID: ${order.user_id}`;
      await bot.telegram.sendMessage(
        t.admin_telegram_id,
        `🛒 *Order Baru!*\n\n` +
        `🧾 ID: *#${order.id}*\n` +
        `📦 Produk: *${prodLabel}*\n` +
        `👤 User: ${userLabel}\n` +
        `🛍 Qty: *${qty}*\n` +
        `💰 Total: *Rp ${Number(total).toLocaleString('id-ID')}*\n` +
        `📅 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) { console.warn('notif admin error:', err.message); }
  }

  async function getOrderInfo(orderId) {
    const { rows: [info] } = await pool.query(
      `SELECT p.name AS product_name, pv.name AS variant_name, u.username
       FROM orders o JOIN products p ON p.id=o.product_id
       LEFT JOIN product_variants pv ON pv.id=o.variant_id
       JOIN users u ON u.id=o.user_id WHERE o.id=$1`, [orderId]
    );
    return info;
  }

  // ── /start ────────────────────────────────────────────────
  bot.start(async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const username   = ctx.from.username || null;
    const firstName  = ctx.from.first_name || 'User';
    try {
      await pool.query(
        `INSERT INTO users (telegram_id, username, first_name, balance, tenant_id)
         VALUES ($1,$2,$3,0,$4)
         ON CONFLICT (telegram_id, tenant_id) DO UPDATE
           SET username=EXCLUDED.username, first_name=EXCLUDED.first_name`,
        [telegramId, username, firstName, tenantId]
      );
    } catch (err) { console.error('start insert error:', err.message); }
    await ctx.reply(
      `🏪 *Selamat datang di ${tenant.name}!*\n\n👤 Halo, *${firstName}*!\n\nPilih menu di bawah untuk mulai berbelanja. 🛍`,
      { parse_mode: 'Markdown', ...MAIN_KEYBOARD }
    );
  });

  // ── /fileid ───────────────────────────────────────────────
  bot.command('fileid', async (ctx) => {
    const photo = ctx.message?.reply_to_message?.photo;
    if (!photo) return ctx.reply('📸 Cara pakai:\n1. Kirim gambar ke bot\n2. Reply gambar itu\n3. Ketik /fileid');
    const fileId = photo[photo.length - 1].file_id;
    ctx.reply(`✅ *File ID gambar:*\n\n\`${fileId}\`\n\n_Copy dan paste ke dashboard Settings._`, { parse_mode: 'Markdown' });
  });

  // ── Saldo Saya ────────────────────────────────────────────
  bot.hears('💰 Saldo Saya', async (ctx) => {
    try {
      const { rows: [user] } = await pool.query('SELECT balance FROM users WHERE telegram_id=$1 AND tenant_id=$2', [ctx.from.id.toString(), tenantId]);
      ctx.reply(`💰 *Saldo Kamu*\n\nRp *${Number(user?.balance||0).toLocaleString('id-ID')}*\n\n_(Hubungi admin untuk top-up)_`, { parse_mode: 'Markdown' });
    } catch { ctx.reply('Gagal mengambil saldo.'); }
  });

  // ── Bantuan ───────────────────────────────────────────────
  bot.hears('📞 Bantuan', async (ctx) => {
    try {
      const { rows: [t] } = await pool.query(`SELECT help_text FROM tenants WHERE id=$1`, [tenantId]);
      const text = t?.help_text || `📞 *Bantuan & Support*\n\nHubungi admin ${tenant.name} jika ada masalah.\n\n• Produk dikirim otomatis setelah pembayaran\n• Pembayaran via QRIS\n\n⚠️ Sertakan ID pesanan saat menghubungi admin.`;
      ctx.reply(text, { parse_mode: 'Markdown' });
    } catch { ctx.reply('Gagal memuat bantuan.'); }
  });

  // ── Daftar Produk ─────────────────────────────────────────
  bot.hears('🛍 Daftar Produk', async (ctx) => { await showLoadingThenProductList(ctx); });

  // ── Menu ──────────────────────────────────────────────────
  bot.hears('🏠 Menu', async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const username   = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    const now        = new Date().toLocaleString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
    });
    try {
      const { rows: [user] } = await pool.query(
        `SELECT u.balance, COUNT(o.id) FILTER (WHERE o.status='paid') AS total_transaksi
         FROM users u LEFT JOIN orders o ON o.user_id=u.id AND o.tenant_id=$2
         WHERE u.telegram_id=$1 AND u.tenant_id=$2 GROUP BY u.balance`,
        [telegramId, tenantId]
      );
      const { rows: [botStats] } = await pool.query(
        `SELECT COUNT(DISTINCT u.id) AS total_users,
                COALESCE(SUM(o.qty) FILTER (WHERE o.status='paid'), 0) AS total_terjual
         FROM users u LEFT JOIN orders o ON o.tenant_id=$1 WHERE u.tenant_id=$1`,
        [tenantId]
      );
      await ctx.reply(
        `👋 Halo ${username}\n🕐 ${now} WIB\n\n` +
        `👤 *Informasi Pengguna:*\n` +
        `├ ID: \`${telegramId}\`\n` +
        `├ Nama: ${username}\n` +
        `├ Total Transaksi: *${user?.total_transaksi || 0}x*\n` +
        `└ Saldo: *Rp ${Number(user?.balance || 0).toLocaleString('id-ID')}*\n\n` +
        `📊 *Statistik Bot:*\n` +
        `└ Total Pengguna: *${botStats?.total_users || 0} user*`,
        { parse_mode: 'Markdown', ...MAIN_KEYBOARD }
      );
    } catch (err) { console.error('menu error:', err); await ctx.reply('Pilih menu:', MAIN_KEYBOARD); }
  });

  // ── Populer ───────────────────────────────────────────────
  bot.hears('🔥 Populer', async (ctx) => {
    try {
      const { rows } = await pool.query(
        `SELECT p.name AS product_name, pv.name AS variant_name,
                COALESCE(SUM(o.qty), 0) AS total_sold
         FROM orders o JOIN products p ON p.id=o.product_id
         LEFT JOIN product_variants pv ON pv.id=o.variant_id
         WHERE o.tenant_id=$1 AND o.status='paid'
         GROUP BY p.name, pv.name ORDER BY total_sold DESC LIMIT 5`,
        [tenantId]
      );
      if (!rows.length) return ctx.reply('🔥 *Produk Populer*\n\nBelum ada data penjualan.', { parse_mode: 'Markdown' });
      const list = rows.map((r, i) => {
        const label = r.variant_name ? `${r.product_name} - ${r.variant_name}` : r.product_name;
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
        return `${medal} *${label}*\n   📦 ${r.total_sold} terjual`;
      }).join('\n\n');
      await ctx.reply(`🔥 *Produk Terlaris*\n\n${list}`, { parse_mode: 'Markdown' });
    } catch (err) { console.error('populer error:', err); ctx.reply('Gagal memuat produk populer.'); }
  });

  // ── Pesanan Saya ──────────────────────────────────────────
  bot.hears('📦 Pesanan Saya', async (ctx) => {
    const telegramId = ctx.from.id.toString();
    try {
      const { rows: [user] } = await pool.query('SELECT id FROM users WHERE telegram_id=$1 AND tenant_id=$2', [telegramId, tenantId]);
      if (!user) return ctx.reply('Silakan kirim /start terlebih dahulu.');
      const { rows: orders } = await pool.query(
        `SELECT o.id, o.amount, o.status, o.qty, o.created_at,
                p.name AS product_name, pv.name AS variant_name
         FROM orders o JOIN products p ON p.id=o.product_id
         LEFT JOIN product_variants pv ON pv.id=o.variant_id
         WHERE o.user_id=$1 AND o.tenant_id=$2 ORDER BY o.created_at DESC LIMIT 10`,
        [user.id, tenantId]
      );
      if (!orders.length) return ctx.reply(`📦 *Pesanan Saya*\n\nKamu belum memiliki pesanan.`, { parse_mode: 'Markdown' });
      const statusEmoji = { paid: '✅', pending: '⏳', failed: '❌', expired: '🕐' };
      const list = orders.map((o, i) => {
        const prodLabel = o.variant_name ? `${o.product_name} - ${o.variant_name}` : o.product_name;
        return `${i+1}. ${statusEmoji[o.status]||'❓'} *${prodLabel}*\n   🛒 x${o.qty} • Rp ${Number(o.amount).toLocaleString('id-ID')}\n   🧾 #${o.id} • ${new Date(o.created_at).toLocaleDateString('id-ID')}`;
      }).join('\n\n');
      await ctx.reply(`📦 *Pesanan Saya* _(10 terakhir)_\n\n${list}`, { parse_mode: 'Markdown' });
    } catch (err) { console.error('pesanan saya error:', err); ctx.reply('Gagal memuat pesanan.'); }
  });

  // ── Voucher List ──────────────────────────────────────────
  bot.hears('🎟️ Voucher', async (ctx) => {
    try {
      const { rows: vouchers } = await pool.query(
        `SELECT * FROM vouchers WHERE tenant_id=$1 AND is_active=true
           AND (expired_at IS NULL OR expired_at > NOW()) ORDER BY created_at DESC`,
        [tenantId]
      );
      if (!vouchers.length) return ctx.reply('🎟️ *Voucher*\n\nTidak ada voucher tersedia saat ini.', { parse_mode: 'Markdown' });
      const list = vouchers.map(v => {
        const diskon  = v.type === 'percent' ? `${v.value}% off` : `Rp ${Number(v.value).toLocaleString('id-ID')} off`;
        const expired = v.expired_at ? `⏰ Berlaku hingga: ${new Date(v.expired_at).toLocaleDateString('id-ID')}` : `⏰ Tanpa batas waktu`;
        return `🎟️ *${v.code}*\n💸 Diskon: ${diskon}\n${expired}`;
      }).join('\n\n');
      await ctx.reply(`🎟️ *Daftar Voucher Aktif*\n\n${list}\n\n_Gunakan saat checkout untuk mendapatkan diskon!_`, { parse_mode: 'Markdown' });
    } catch (err) { console.error('voucher list error:', err); ctx.reply('Gagal memuat voucher.'); }
  });

  // ── Input kode voucher ────────────────────────────────────
  bot.on('text', async (ctx, next) => {
    const text    = ctx.message.text;
    const vKey    = `${tenantId}_${ctx.from.id}`;
    const pending = userVoucherMap[vKey];
    if (!pending) return next();
    if (text.includes(' ')) return next();
    if (text.toLowerCase() === 'batal') {
      delete userVoucherMap[vKey];
      return ctx.reply('❌ Input voucher dibatalkan.', MAIN_KEYBOARD);
    }
    const code = text.toUpperCase();
    const telegramId = ctx.from.id.toString();
    try {
      const { rows: [user] } = await pool.query('SELECT id FROM users WHERE telegram_id=$1 AND tenant_id=$2', [telegramId, tenantId]);
      if (!user) return ctx.reply('Silakan kirim /start terlebih dahulu.');
      let price;
      if (pending.type === 'product') {
        const { rows: [p] } = await pool.query(`SELECT price FROM products WHERE id=$1`, [pending.id]);
        price = p?.price || 0;
      } else {
        const { rows: [v] } = await pool.query(`SELECT price FROM product_variants WHERE id=$1`, [pending.id]);
        price = v?.price || 0;
      }
      const qty = userCart[vKey]?.qty || 1;
      const amount = price * qty;
      const { rows: [voucher] } = await pool.query(
        `SELECT * FROM vouchers WHERE code=$1 AND tenant_id=$2 AND is_active=true
           AND (expired_at IS NULL OR expired_at > NOW())`,
        [code, tenantId]
      );
      if (!voucher) { delete userVoucherMap[vKey]; return ctx.reply('❌ Kode voucher tidak valid atau sudah expired.'); }
      const { rows: [usage] } = await pool.query(`SELECT COUNT(*) AS cnt FROM voucher_usage WHERE voucher_id=$1 AND user_id=$2`, [voucher.id, user.id]);
      if (parseInt(usage.cnt) >= voucher.max_per_user) { delete userVoucherMap[vKey]; return ctx.reply('❌ Kamu sudah pernah menggunakan voucher ini.'); }
      const discount    = voucher.type === 'percent' ? Math.round(amount * voucher.value / 100) : Math.min(voucher.value, amount);
      const finalAmount = amount - discount;
      const diskonText  = voucher.type === 'percent' ? `${voucher.value}%` : `Rp ${Number(voucher.value).toLocaleString('id-ID')}`;
      delete userVoucherMap[vKey];
      await ctx.reply(
        `✅ *Voucher Berhasil Diterapkan!*\n\n🎟️ Kode: *${voucher.code}*\n💸 Diskon: *${diskonText}*\n💰 Harga asal: Rp ${Number(amount).toLocaleString('id-ID')}\n✨ Harga setelah diskon: *Rp ${Number(finalAmount).toLocaleString('id-ID')}*\n\nPilih metode bayar:`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard(
          pending.type === 'product' ? [
            [Markup.button.callback('💳 Bayar via QRIS/Transfer', `pay_qris_p_${pending.id}_${qty}_${voucher.id}_${discount}`)],
            [Markup.button.callback('💰 Bayar via Saldo', `pay_saldo_p_${pending.id}_${qty}_${voucher.id}_${discount}`)],
            [Markup.button.callback('❌ Batal', 'cancel_buy')],
          ] : [
            [Markup.button.callback('💳 Bayar via QRIS/Transfer', `pay_qris_v_${pending.id}_${qty}_${voucher.id}_${discount}`)],
            [Markup.button.callback('💰 Bayar via Saldo', `pay_saldo_v_${pending.id}_${qty}_${voucher.id}_${discount}`)],
            [Markup.button.callback('❌ Batal', 'cancel_buy')],
          ]
        ) }
      );
    } catch (err) { console.error('voucher input error:', err); ctx.reply('Gagal memproses voucher.'); }
  });

  // ── User ketik nomor produk ───────────────────────────────
  bot.hears(/^(\d+)$/, async (ctx) => {
    const num = ctx.message.text;
    const key = `${tenantId}_${ctx.from.id}`;
    if (userProductMap[key]?.[num]) await showProductDetail(ctx, userProductMap[key][num]);
  });

  // ── Navigasi halaman inline ───────────────────────────────
  bot.action(/^page_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    const msgId = ctx.callbackQuery.message?.message_id;
    await showProductList(ctx, parseInt(ctx.match[1]), msgId);
  });

  // ── Pilih varian ──────────────────────────────────────────
  bot.action(/^variant_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    await showVariantDetail(ctx, parseInt(ctx.match[1]), 1);
  });

  // ── Qty varian ────────────────────────────────────────────
  bot.action(/^qty_(plus|minus)_v_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    const dir = ctx.match[1], variantId = parseInt(ctx.match[2]);
    const cartKey = `${tenantId}_${ctx.from.id}`;
    if (!userCart[cartKey] || userCart[cartKey].variantId !== variantId) userCart[cartKey] = { variantId, qty: 1, type: 'variant' };
    const cart = userCart[cartKey];
    const { rows: [v] } = await pool.query(`SELECT COUNT(s.id) FILTER (WHERE s.status='available') AS stock_count FROM product_variants pv LEFT JOIN stocks s ON s.variant_id=pv.id WHERE pv.id=$1 AND pv.tenant_id=$2 GROUP BY pv.id`, [variantId, tenantId]);
    const maxStock = parseInt(v?.stock_count || 0);
    if (dir === 'plus' && cart.qty < maxStock) cart.qty++;
    if (dir === 'minus' && cart.qty > 1) cart.qty--;
    try { await ctx.editMessageReplyMarkup(buildVariantKeyboard(variantId, cart.qty, maxStock > 0, null).reply_markup); } catch {}
  });

  // ── Qty produk ────────────────────────────────────────────
  bot.action(/^qty_(plus|minus)_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    const dir = ctx.match[1], productId = parseInt(ctx.match[2]);
    const cartKey = `${tenantId}_${ctx.from.id}`;
    if (!userCart[cartKey] || userCart[cartKey].productId !== productId) userCart[cartKey] = { productId, qty: 1, type: 'product' };
    const cart = userCart[cartKey];
    const { rows: [p] } = await pool.query(`SELECT COUNT(s.id) FILTER (WHERE s.status='available') AS stock_count FROM products p LEFT JOIN stocks s ON s.product_id=p.id WHERE p.id=$1 AND p.tenant_id=$2 GROUP BY p.id`, [productId, tenantId]);
    const maxStock = parseInt(p?.stock_count || 0);
    if (dir === 'plus' && cart.qty < maxStock) cart.qty++;
    if (dir === 'minus' && cart.qty > 1) cart.qty--;
    try { await ctx.editMessageReplyMarkup(buildProductKeyboard(productId, cart.qty, maxStock > 0).reply_markup); } catch {}
  });

  // ── Pakai Voucher ─────────────────────────────────────────
  bot.action(/^voucher_p_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    userVoucherMap[`${tenantId}_${ctx.from.id}`] = { type: 'product', id: parseInt(ctx.match[1]) };
    await ctx.reply(`🎟️ *Masukkan Kode Voucher*\n\nKetik kode voucher kamu:\n_(Ketik "batal" untuk membatalkan)_`, { parse_mode: 'Markdown' });
  });

  bot.action(/^voucher_v_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    userVoucherMap[`${tenantId}_${ctx.from.id}`] = { type: 'variant', id: parseInt(ctx.match[1]) };
    await ctx.reply(`🎟️ *Masukkan Kode Voucher*\n\nKetik kode voucher kamu:\n_(Ketik "batal" untuk membatalkan)_`, { parse_mode: 'Markdown' });
  });

  // ── Beli varian ───────────────────────────────────────────
  bot.action(/^buy_v_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    const variantId = parseInt(ctx.match[1]);
    const qty       = userCart[`${tenantId}_${ctx.from.id}`]?.qty || 1;
    const { rows: [variant] } = await pool.query(`SELECT pv.*, p.name AS product_name FROM product_variants pv JOIN products p ON p.id=pv.product_id WHERE pv.id=$1 AND pv.tenant_id=$2 AND pv.is_active=true`, [variantId, tenantId]);
    if (!variant) return ctx.answerCbQuery('Varian tidak ditemukan.', { show_alert: true });
    await ctx.editMessageText(
      `💳 *Pilih Metode Pembayaran*\n\n📦 ${variant.product_name} - ${variant.name} x${qty}\n💰 Total: *Rp ${Number(variant.price * qty).toLocaleString('id-ID')}*\n\nPilih metode bayar:`,
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
        [Markup.button.callback('💳 Bayar via QRIS/Transfer', `pay_qris_v_${variantId}_${qty}`)],
        [Markup.button.callback('💰 Bayar via Saldo', `pay_saldo_v_${variantId}_${qty}`)],
        [Markup.button.callback('❌ Batal', 'cancel_buy')],
      ]) }
    ).catch(() => {});
  });

  // ── Beli produk ───────────────────────────────────────────
  bot.action(/^buy_p_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    const productId = parseInt(ctx.match[1]);
    const qty       = userCart[`${tenantId}_${ctx.from.id}`]?.qty || 1;
    const { rows: [product] } = await pool.query(`SELECT * FROM products WHERE id=$1 AND tenant_id=$2 AND is_active=true`, [productId, tenantId]);
    if (!product) return ctx.answerCbQuery('Produk tidak ditemukan.', { show_alert: true });
    await ctx.editMessageText(
      `💳 *Pilih Metode Pembayaran*\n\n📦 ${product.name} x${qty}\n💰 Total: *Rp ${Number(product.price * qty).toLocaleString('id-ID')}*\n\nPilih metode bayar:`,
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
        [Markup.button.callback('💳 Bayar via QRIS/Transfer', `pay_qris_p_${productId}_${qty}`)],
        [Markup.button.callback('💰 Bayar via Saldo', `pay_saldo_p_${productId}_${qty}`)],
        [Markup.button.callback('❌ Batal', 'cancel_buy')],
      ]) }
    ).catch(() => {});
  });

  // ── Bayar saldo varian ────────────────────────────────────
  bot.action(/^pay_saldo_v_(\d+)_(\d+)(?:_(\d+)_(\d+))?$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    const variantId = parseInt(ctx.match[1]), qty = parseInt(ctx.match[2]);
    const voucherId = ctx.match[3] ? parseInt(ctx.match[3]) : null;
    const discount  = ctx.match[4] ? parseInt(ctx.match[4]) : 0;
    const telegramId = ctx.from.id.toString();
    try {
      const { rows: [user] } = await pool.query('SELECT id, balance FROM users WHERE telegram_id=$1 AND tenant_id=$2', [telegramId, tenantId]);
      if (!user) return ctx.editMessageText('Silakan kirim /start terlebih dahulu.').catch(() => {});
      const { rows: [variant] } = await pool.query(`SELECT pv.*, p.name AS product_name FROM product_variants pv JOIN products p ON p.id=pv.product_id WHERE pv.id=$1 AND pv.tenant_id=$2 AND pv.is_active=true`, [variantId, tenantId]);
      if (!variant) return ctx.editMessageText('Varian tidak ditemukan.').catch(() => {});
      const total = (variant.price * qty) - discount;
      if ((user.balance||0) < total) return ctx.editMessageText(`❌ *Saldo tidak cukup!*\n\n💰 Saldo: *Rp ${Number(user.balance||0).toLocaleString('id-ID')}*\n🧾 Total: *Rp ${Number(total).toLocaleString('id-ID')}*`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali','cancel_buy')]]) }).catch(() => {});
      const { rows: [sc] } = await pool.query(`SELECT COUNT(*) AS cnt FROM stocks WHERE variant_id=$1 AND tenant_id=$2 AND status='available'`, [variantId, tenantId]);
      if (parseInt(sc.cnt) < qty) return ctx.editMessageText(`Stok tidak cukup. Tersedia: ${sc.cnt}`).catch(() => {});
      const diskonInfo = discount > 0 ? `\n🎟️ Diskon: *-Rp ${Number(discount).toLocaleString('id-ID')}*` : '';
      await ctx.editMessageText(
        `✅ *Konfirmasi Pembelian*\n\n📦 ${variant.product_name} - ${variant.name} x${qty}${diskonInfo}\n💰 Total: *Rp ${Number(total).toLocaleString('id-ID')}*\n💳 Saldo setelah bayar: *Rp ${Number((user.balance||0)-total).toLocaleString('id-ID')}*\n\nLanjutkan?`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('✅ Ya, Bayar Sekarang',`confirm_saldo_v_${variantId}_${qty}_${voucherId||0}_${discount}`)],[Markup.button.callback('❌ Batal','cancel_buy')]]) }
      ).catch(() => {});
    } catch (err) { console.error('pay_saldo_v error:', err); ctx.editMessageText('Terjadi kesalahan.').catch(() => {}); }
  });

  // ── Konfirmasi saldo varian ───────────────────────────────
  bot.action(/^confirm_saldo_v_(\d+)_(\d+)_(\d+)_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery('Memproses...'); } catch {}
    const variantId = parseInt(ctx.match[1]), qty = parseInt(ctx.match[2]);
    const voucherId = parseInt(ctx.match[3]), discount = parseInt(ctx.match[4]);
    const telegramId = ctx.from.id.toString();
    await ctx.editMessageText('⏳ Memproses pembayaran...').catch(() => {});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [user] } = await client.query('SELECT id, balance FROM users WHERE telegram_id=$1 AND tenant_id=$2 FOR UPDATE', [telegramId, tenantId]);
      const { rows: [variant] } = await client.query(`SELECT pv.*, p.name AS product_name, p.id AS product_id FROM product_variants pv JOIN products p ON p.id=pv.product_id WHERE pv.id=$1 AND pv.tenant_id=$2`, [variantId, tenantId]);
      const total = (variant.price * qty) - discount;
      if ((user.balance||0) < total) { await client.query('ROLLBACK'); return ctx.editMessageText('❌ Saldo tidak cukup.').catch(() => {}); }
      await client.query('UPDATE users SET balance=balance-$1 WHERE id=$2', [total, user.id]);
      const { rows: [order] } = await client.query(`INSERT INTO orders (user_id, product_id, variant_id, payment_id, amount, status, qty, paid_at, tenant_id) VALUES ($1,$2,$3,$4,$5,'paid',$6,NOW(),$7) RETURNING *`, [user.id, variant.product_id, variantId, `SALDO-${Date.now()}`, total, qty, tenantId]);
      if (voucherId > 0) await client.query(`INSERT INTO voucher_usage (voucher_id, user_id, order_id) VALUES ($1,$2,$3)`, [voucherId, user.id, order.id]);
      await client.query('COMMIT');
      await ctx.editMessageText(`✅ *Pembayaran Berhasil!*\n\n📦 ${variant.product_name} - ${variant.name} x${qty}\n💰 Total: *Rp ${Number(total).toLocaleString('id-ID')}*\n\n📨 Akun sedang dikirim...`, { parse_mode: 'Markdown' }).catch(() => {});
      const info = await getOrderInfo(order.id);
      if (info) await notifyAdminOrder(order, info.product_name, info.variant_name, info.username, qty, total);
      const { assignStockAndDeliver } = require('../services/stockService');
      await assignStockAndDeliver(order, tenantId);
    } catch (err) { await client.query('ROLLBACK'); console.error('confirm_saldo_v error:', err); ctx.editMessageText('❌ Terjadi kesalahan.').catch(() => {}); }
    finally { client.release(); }
  });

  // ── Bayar saldo produk ────────────────────────────────────
  bot.action(/^pay_saldo_p_(\d+)_(\d+)(?:_(\d+)_(\d+))?$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    const productId = parseInt(ctx.match[1]), qty = parseInt(ctx.match[2]);
    const voucherId = ctx.match[3] ? parseInt(ctx.match[3]) : null;
    const discount  = ctx.match[4] ? parseInt(ctx.match[4]) : 0;
    const telegramId = ctx.from.id.toString();
    try {
      const { rows: [user] } = await pool.query('SELECT id, balance FROM users WHERE telegram_id=$1 AND tenant_id=$2', [telegramId, tenantId]);
      if (!user) return ctx.editMessageText('Silakan kirim /start terlebih dahulu.').catch(() => {});
      const { rows: [product] } = await pool.query(`SELECT * FROM products WHERE id=$1 AND tenant_id=$2 AND is_active=true`, [productId, tenantId]);
      if (!product) return ctx.editMessageText('Produk tidak ditemukan.').catch(() => {});
      const total = (product.price * qty) - discount;
      if ((user.balance||0) < total) return ctx.editMessageText(`❌ *Saldo tidak cukup!*\n\n💰 Saldo: *Rp ${Number(user.balance||0).toLocaleString('id-ID')}*\n🧾 Total: *Rp ${Number(total).toLocaleString('id-ID')}*`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali','cancel_buy')]]) }).catch(() => {});
      const { rows: [sc] } = await pool.query(`SELECT COUNT(*) AS cnt FROM stocks WHERE product_id=$1 AND tenant_id=$2 AND status='available' AND variant_id IS NULL`, [productId, tenantId]);
      if (parseInt(sc.cnt) < qty) return ctx.editMessageText(`Stok tidak cukup. Tersedia: ${sc.cnt}`).catch(() => {});
      const diskonInfo = discount > 0 ? `\n🎟️ Diskon: *-Rp ${Number(discount).toLocaleString('id-ID')}*` : '';
      await ctx.editMessageText(
        `✅ *Konfirmasi Pembelian*\n\n📦 ${product.name} x${qty}${diskonInfo}\n💰 Total: *Rp ${Number(total).toLocaleString('id-ID')}*\n💳 Saldo setelah bayar: *Rp ${Number((user.balance||0)-total).toLocaleString('id-ID')}*\n\nLanjutkan?`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('✅ Ya, Bayar Sekarang',`confirm_saldo_p_${productId}_${qty}_${voucherId||0}_${discount}`)],[Markup.button.callback('❌ Batal','cancel_buy')]]) }
      ).catch(() => {});
    } catch (err) { console.error('pay_saldo_p error:', err); ctx.editMessageText('Terjadi kesalahan.').catch(() => {}); }
  });

  // ── Konfirmasi saldo produk ───────────────────────────────
  bot.action(/^confirm_saldo_p_(\d+)_(\d+)_(\d+)_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery('Memproses...'); } catch {}
    const productId = parseInt(ctx.match[1]), qty = parseInt(ctx.match[2]);
    const voucherId = parseInt(ctx.match[3]), discount = parseInt(ctx.match[4]);
    const telegramId = ctx.from.id.toString();
    await ctx.editMessageText('⏳ Memproses pembayaran...').catch(() => {});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [user] } = await client.query('SELECT id, balance FROM users WHERE telegram_id=$1 AND tenant_id=$2 FOR UPDATE', [telegramId, tenantId]);
      const { rows: [product] } = await client.query(`SELECT * FROM products WHERE id=$1 AND tenant_id=$2`, [productId, tenantId]);
      const total = (product.price * qty) - discount;
      if ((user.balance||0) < total) { await client.query('ROLLBACK'); return ctx.editMessageText('❌ Saldo tidak cukup.').catch(() => {}); }
      await client.query('UPDATE users SET balance=balance-$1 WHERE id=$2', [total, user.id]);
      const { rows: [order] } = await client.query(`INSERT INTO orders (user_id, product_id, payment_id, amount, status, qty, paid_at, tenant_id) VALUES ($1,$2,$3,$4,'paid',$5,NOW(),$6) RETURNING *`, [user.id, productId, `SALDO-${Date.now()}`, total, qty, tenantId]);
      if (voucherId > 0) await client.query(`INSERT INTO voucher_usage (voucher_id, user_id, order_id) VALUES ($1,$2,$3)`, [voucherId, user.id, order.id]);
      await client.query('COMMIT');
      await ctx.editMessageText(`✅ *Pembayaran Berhasil!*\n\n📦 ${product.name} x${qty}\n💰 Total: *Rp ${Number(total).toLocaleString('id-ID')}*\n\n📨 Akun sedang dikirim...`, { parse_mode: 'Markdown' }).catch(() => {});
      const info = await getOrderInfo(order.id);
      if (info) await notifyAdminOrder(order, info.product_name, info.variant_name, info.username, qty, total);
      const { assignStockAndDeliver } = require('../services/stockService');
      await assignStockAndDeliver(order, tenantId);
    } catch (err) { await client.query('ROLLBACK'); console.error('confirm_saldo_p error:', err); ctx.editMessageText('❌ Terjadi kesalahan.').catch(() => {}); }
    finally { client.release(); }
  });

  // ── QRIS varian ───────────────────────────────────────────
  bot.action(/^pay_qris_v_(\d+)_(\d+)(?:_(\d+)_(\d+))?$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    const variantId = parseInt(ctx.match[1]), qty = parseInt(ctx.match[2]);
    const voucherId = ctx.match[3] ? parseInt(ctx.match[3]) : null;
    const discount  = ctx.match[4] ? parseInt(ctx.match[4]) : 0;
    const telegramId = ctx.from.id.toString();
    try {
      const { rows: [user] } = await pool.query('SELECT id FROM users WHERE telegram_id=$1 AND tenant_id=$2', [telegramId, tenantId]);
      if (!user) return ctx.editMessageText('Silakan kirim /start terlebih dahulu.').catch(() => {});
      const { rows: [variant] } = await pool.query(`SELECT pv.*, p.name AS product_name, p.id AS product_id FROM product_variants pv JOIN products p ON p.id=pv.product_id WHERE pv.id=$1 AND pv.tenant_id=$2 AND pv.is_active=true`, [variantId, tenantId]);
      if (!variant) return ctx.editMessageText('Varian tidak ditemukan.').catch(() => {});
      const { rows: [sc] } = await pool.query(`SELECT COUNT(*) AS cnt FROM stocks WHERE variant_id=$1 AND tenant_id=$2 AND status='available'`, [variantId, tenantId]);
      if (parseInt(sc.cnt) < qty) return ctx.editMessageText(`Stok tidak cukup. Tersedia: ${sc.cnt}`).catch(() => {});
      const total = (variant.price * qty) - discount;
      const paymentOrderId = `ORDER-${Date.now()}-${user.id}`;
      const { rows: [tenantConfig] } = await pool.query(`SELECT tripay_api_key, tripay_private_key, tripay_merchant_code, tripay_mode, pakasir_api_key, pakasir_project_slug, payment_gateway FROM tenants WHERE id=$1`, [tenantId]);
      const gateway = tenantConfig?.payment_gateway || 'tripay';
      if (gateway === 'pakasir' && !tenantConfig?.pakasir_api_key) return ctx.editMessageText('❌ Pakasir belum dikonfigurasi.').catch(() => {});
      if (gateway === 'tripay' && !tenantConfig?.tripay_api_key) return ctx.editMessageText('❌ Payment gateway belum dikonfigurasi.').catch(() => {});
      const { createPayment } = require('../services/paymentService');
      const config = gateway === 'pakasir' ? { gateway: 'pakasir', api_key: tenantConfig.pakasir_api_key, project_slug: tenantConfig.pakasir_project_slug } : { gateway: 'tripay', api_key: tenantConfig.tripay_api_key, private_key: tenantConfig.tripay_private_key, merchant_code: tenantConfig.tripay_merchant_code, mode: tenantConfig.tripay_mode || 'sandbox' };
      const result = await createPayment(config, { orderId: paymentOrderId, amount: total, productName: `${variant.product_name} - ${variant.name} x${qty}`, customerName: ctx.from.first_name || 'Customer' });
      const diskonInfo = discount > 0 ? `\n🎟️ Diskon: *-Rp ${Number(discount).toLocaleString('id-ID')}*` : '';
      if (gateway === 'pakasir') {
        const { rows: [newOrder] } = await pool.query(`INSERT INTO orders (user_id, product_id, variant_id, payment_id, payment_url, amount, status, qty, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8) RETURNING id`, [user.id, variant.product_id, variantId, paymentOrderId, result.payment_number, total, qty, tenantId]);
        if (voucherId > 0) await pool.query(`INSERT INTO voucher_usage (voucher_id, user_id, order_id) VALUES ($1,$2,$3)`, [voucherId, user.id, newOrder.id]);
        // Notif admin order baru
        const fakeOrder = { id: newOrder.id, user_id: user.id, qty, amount: total };
        const info = await getOrderInfo(newOrder.id).catch(() => null);
        if (info) await notifyAdminOrder(fakeOrder, info.product_name, info.variant_name, info.username, qty, total);
        const expiredText = result.expired_at ? `⏰ Expired: *${new Date(result.expired_at).toLocaleString('id-ID')}*` : `⏰ Berlaku *15 menit*`;
        const caption = `🧾 *Pesanan Dibuat!*\n\n📦 ${variant.product_name} - ${variant.name} x${qty}${diskonInfo}\n💰 Total: *Rp ${Number(result.total_payment||total).toLocaleString('id-ID')}*\n${expiredText}\n\n📲 *Cara Bayar QRIS:*\n1. Buka e-wallet (GoPay, OVO, Dana, dll)\n2. Scan gambar QR di atas\n3. Atau pilih *Salin Kode* jika tidak bisa scan`;
        const keyboard = Markup.inlineKeyboard([[Markup.button.callback('📋 Salin Kode QRIS',`copy_qris_${newOrder.id}`)],[Markup.button.callback('✅ Saya Sudah Bayar',`check_pakasir_${newOrder.id}`)],[Markup.button.callback('❌ Batal','cancel_buy')]]);
        try {
          const qrBuffer = await QRCode.toBuffer(result.payment_number, { type: 'png', width: 512, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
          await ctx.deleteMessage().catch(() => {});
          const sentMsg = await ctx.replyWithPhoto({ source: qrBuffer }, { caption, parse_mode: 'Markdown', ...keyboard });
          if (sentMsg?.message_id) await pool.query(`UPDATE orders SET chat_id=$1, message_id=$2 WHERE id=$3`, [sentMsg.chat.id, sentMsg.message_id, newOrder.id]);
        } catch { await ctx.deleteMessage().catch(() => {}); await ctx.reply(caption + `\n\n📋 *Kode QRIS:*\n\`${result.payment_number}\``, { parse_mode: 'Markdown', ...keyboard }).catch(() => {}); }
      } else {
        await pool.query(`INSERT INTO orders (user_id, product_id, variant_id, payment_id, payment_url, amount, status, qty, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8)`, [user.id, variant.product_id, variantId, paymentOrderId, result.payment_url, total, qty, tenantId]);
        await ctx.editMessageText(`🧾 *Pesanan Dibuat!*\n\n📦 ${variant.product_name} - ${variant.name} x${qty}${diskonInfo}\n💰 Total: *Rp ${Number(total).toLocaleString('id-ID')}*\n\nKlik tombol di bawah untuk membayar.\n⏰ Link berlaku *15 menit*.`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.url('💳 Bayar Sekarang', result.payment_url)]]) }).catch(() => {});
      }
    } catch (err) { console.error('pay_qris_v error:', err); ctx.editMessageText(`❌ Terjadi kesalahan: ${err.message}`).catch(() => {}); }
  });

  // ── QRIS produk ───────────────────────────────────────────
bot.action(/^pay_qris_p_(\d+)_(\d+)(?:_(\d+)_(\d+))?$/, async (ctx) => {
  console.log("🔥 pay_qris_p_ TRIGGERED");

  try { await ctx.answerCbQuery('Mempersiapkan QRIS...'); } catch (e) {}

  const productId = parseInt(ctx.match[1]);
  const qty = parseInt(ctx.match[2]);
  const voucherId = ctx.match[3] ? parseInt(ctx.match[3]) : null;
  const discount = ctx.match[4] ? parseInt(ctx.match[4]) : 0;
  const telegramId = ctx.from.id.toString();

  try {
    const { rows: [user] } = await pool.query('SELECT id FROM users WHERE telegram_id=$1 AND tenant_id=$2', [telegramId, tenantId]);
    if (!user) return ctx.editMessageText('Silakan kirim /start terlebih dahulu.').catch(() => {});

    const { rows: [product] } = await pool.query(`SELECT * FROM products WHERE id=$1 AND tenant_id=$2 AND is_active=true`, [productId, tenantId]);
    if (!product) return ctx.editMessageText('Produk tidak ditemukan.').catch(() => {});

    const { rows: [sc] } = await pool.query(`SELECT COUNT(*) AS cnt FROM stocks WHERE product_id=$1 AND tenant_id=$2 AND status='available' AND variant_id IS NULL`, [productId, tenantId]);
    if (parseInt(sc.cnt) < qty) return ctx.editMessageText(`Stok tidak cukup. Tersedia: ${sc.cnt}`).catch(() => {});

    const total = (product.price * qty) - discount;
    const paymentOrderId = `ORDER-${Date.now()}-${user.id}`;

    const { rows: [tenantConfig] } = await pool.query(`SELECT pakasir_api_key, pakasir_project_slug, payment_gateway FROM tenants WHERE id=$1`, [tenantId]);

    if (!tenantConfig?.pakasir_api_key) {
      return ctx.editMessageText('❌ Pakasir belum dikonfigurasi.').catch(() => {});
    }

    const { createPayment } = require('../services/paymentService');

    const result = await createPayment({
      gateway: 'pakasir',
      api_key: tenantConfig.pakasir_api_key,
      project_slug: tenantConfig.pakasir_project_slug,
      orderId: paymentOrderId,
      amount: total,
      productName: `${product.name} x${qty}`
    });

    const diskonInfo = discount > 0 ? `\n🎟️ Diskon: *-Rp ${Number(discount).toLocaleString('id-ID')}*` : '';

    const { rows: [newOrder] } = await pool.query(`
      INSERT INTO orders (user_id, product_id, payment_id, payment_url, amount, status, qty, tenant_id) 
      VALUES ($1,$2,$3,$4,$5,'pending',$6,$7) RETURNING id
    `, [user.id, productId, paymentOrderId, result.payment_number, total, qty, tenantId]);

    if (voucherId > 0) {
      await pool.query(`INSERT INTO voucher_usage (voucher_id, user_id, order_id) VALUES ($1,$2,$3)`, [voucherId, user.id, newOrder.id]);
    }

    const caption = `🧾 *Pesanan Dibuat!*\n\n📦 ${product.name} x${qty}${diskonInfo}\n💰 Total: *Rp ${Number(total).toLocaleString('id-ID')}*\n\nScan QRIS di bawah ini.\n⏰ Berlaku 15 menit.`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📋 Salin Kode QRIS', `copy_qris_${newOrder.id}`)],
      [Markup.button.callback('✅ Saya Sudah Bayar', `check_pakasir_${newOrder.id}`)],
      [Markup.button.callback('❌ Batal', 'cancel_buy')]
    ]);

    try {
      const qrBuffer = await QRCode.toBuffer(result.payment_number, { type: 'png', width: 512, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
      await ctx.deleteMessage().catch(() => {});
      await ctx.replyWithPhoto({ source: qrBuffer }, { caption, parse_mode: 'Markdown', ...keyboard });
    } catch (e) {
      await ctx.reply(caption + `\n\n📋 *Kode QRIS:*\n\`${result.payment_number}\``, { parse_mode: 'Markdown', ...keyboard });
    }

  } catch (err) {
    console.error('pay_qris_p error:', err);
    await ctx.editMessageText(`❌ Terjadi kesalahan: ${err.message}`).catch(() => {});
  }
});

  // ── Salin QRIS ────────────────────────────────────────────
  bot.action(/^copy_qris_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    try {
      const { rows: [order] } = await pool.query(`SELECT payment_url FROM orders WHERE id=$1 AND tenant_id=$2`, [parseInt(ctx.match[1]), tenantId]);
      if (!order) return ctx.answerCbQuery('Pesanan tidak ditemukan.', { show_alert: true });
      await ctx.reply(`📋 *Kode QRIS:*\n\n\`${order.payment_url}\`\n\n_Paste kode ini di e-wallet kamu._`, { parse_mode: 'Markdown' });
    } catch (err) { console.error('copy_qris error:', err.message); }
  });

  // ── Cek Pakasir ───────────────────────────────────────────
bot.action(/^check_pakasir_(\d+)$/, async (ctx) => {
  try { await ctx.answerCbQuery('Mengecek pembayaran...'); } catch (e) {}

  const orderId = parseInt(ctx.match[1]);

  try {
    console.log(`[CHECK PAKASIR] Order ID: ${orderId}`);

    const { rows: [order] } = await pool.query(`
      SELECT o.*, u.telegram_id 
      FROM orders o JOIN users u ON u.id=o.user_id 
      WHERE o.id=$1 AND o.tenant_id=$2`, [orderId, tenantId]);

    if (!order) return ctx.answerCbQuery('Pesanan tidak ditemukan.', { show_alert: true });

    // 🔒 ANTI DOUBLE PROCESS (TARUH DI SINI)
    const { rows: [check] } = await pool.query(
      'SELECT status FROM orders WHERE id=$1',
      [orderId]
    );

    if (check.status !== 'pending') {
       return ctx.answerCbQuery('⚠️ Order sudah diproses sebelumnya', { show_alert: true });
    }
    if (order.status === 'done') {
      return ctx.answerCbQuery('⚠️ Order sudah selesai diproses', { show_alert: true });
    }

    if (order.status === 'processing') {
      return ctx.answerCbQuery('⏳ Order sedang diproses...', { show_alert: true });
    }

    const { rows: [tenantConfig] } = await pool.query(`SELECT pakasir_api_key, pakasir_project_slug FROM tenants WHERE id=$1`, [tenantId]);

    let checkResp = null;
    const endpoints = [
      `${PAKASIR_URL}/transaction/status`,
      `${PAKASIR_URL}/transactioncheck`,
      `${PAKASIR_URL}/transaction/check`,
      `${PAKASIR_URL}/transactionstatus`
    ];

    for (const endpoint of endpoints) {
      try {
        checkResp = await axios.post(endpoint, {
          project: tenantConfig.pakasir_project_slug,
          order_id: order.payment_id,
          api_key: tenantConfig.pakasir_api_key
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 8000 });
        break;
      } catch (e) {}
    }

    if (!checkResp) return ctx.answerCbQuery('❌ Tidak dapat cek status. Coba lagi.', { show_alert: true });

    const paymentData = checkResp.data?.payment || checkResp.data;
    const isPaid = ['paid','completed','success'].includes(String(paymentData?.status || '').toLowerCase()) || paymentData?.is_paid === true;

    if (!isPaid) return ctx.answerCbQuery('❌ Pembayaran belum diterima. Coba lagi.', { show_alert: true });

    // 🔒 Lock + set processing
    await pool.query(`
      UPDATE orders 
      SET status='processing', paid_at=NOW() 
      WHERE id=$1
    `, [orderId]);

    const { assignStockAndDeliver } = require('../services/stockService');
    await assignStockAndDeliver(order, tenantId);

    // ✅ selesai
    await pool.query(`
      UPDATE orders 
      SET status='done' 
      WHERE id=$1
    `, [orderId]);

    const info = await getOrderInfo(order.id);
    if (info) await notifyAdminOrder(order, info.product_name, info.variant_name, info.username, order.qty, order.amount);

  } catch (err) {
    console.error('check_pakasir error:', err);
    ctx.answerCbQuery('Gagal cek pembayaran.', { show_alert: true });
  }
});
  // ── Cancel ────────────────────────────────────────────────
  bot.action('cancel_buy', async (ctx) => {
    try { await ctx.answerCbQuery('Dibatalkan'); } catch {}
    try {
      const telegramId = ctx.from.id.toString();
      const { rows: [user] } = await pool.query('SELECT id FROM users WHERE telegram_id=$1 AND tenant_id=$2', [telegramId, tenantId]);
      if (user) await pool.query(`DELETE FROM orders WHERE user_id=$1 AND tenant_id=$2 AND status='pending'`, [user.id, tenantId]);
    } catch (err) { console.error('cancel_buy error:', err.message); }
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply('❌ Pesanan dibatalkan.', MAIN_KEYBOARD);
  });

  bot.action('back_to_list', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    await ctx.deleteMessage().catch(() => {});
    const key = `${tenantId}_${ctx.from.id}`;
    await showProductList(ctx, userProductMap[key]?._page || 1);
  });

  bot.action(/^back_to_product_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    await ctx.deleteMessage().catch(() => {});
    await showProductDetail(ctx, parseInt(ctx.match[1]));
  });

  bot.action('no_stock', (ctx) => ctx.answerCbQuery('Stok sedang habis.', { show_alert: true }));
  bot.action('qty_noop', (ctx) => { try { ctx.answerCbQuery(); } catch {} });

// ── Refresh Produk (tanpa varian) ─────────────────────────────
bot.action(/^refresh_product_(\d+)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery('🔄 Memperbarui stok...');
  } catch (e) {}

  const productId = parseInt(ctx.match[1]);
  const cartKey = `${tenantId}_${ctx.from.id}`;

  try {
    const { rows: [product] } = await pool.query(
      `SELECT p.*, 
              COUNT(s.id) FILTER (WHERE s.status='available') AS stock_count,
              COUNT(s.id) FILTER (WHERE s.status='sold') AS sold_count
       FROM products p 
       LEFT JOIN stocks s ON s.product_id = p.id AND s.variant_id IS NULL
       WHERE p.id = $1 
         AND p.tenant_id = $2 
         AND p.is_active = true 
       GROUP BY p.id`,
      [productId, tenantId]
    );

    if (!product) {
      return ctx.answerCbQuery('❌ Produk tidak ditemukan', { show_alert: true });
    }

    const stock   = parseInt(product.stock_count || 0);
    const sold    = parseInt(product.sold_count || 0);
    const inStock = stock > 0;
    const currentQty = userCart[cartKey]?.qty || 1;

    const now = new Date().toLocaleTimeString('id-ID', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      timeZone: 'Asia/Jakarta' 
    });

    const text = `🏷 *${product.name}*\n\n📝 ${product.description || 'Tidak ada deskripsi.'}\n\n━━━━━━━━━━━━━━━━━━━━\n💰 Harga: *Rp ${Number(product.price).toLocaleString('id-ID')}* / akun\n📦 Stok: ${inStock ? `*${stock} tersedia* ✅` : '*Habis* ❌'}\n📊 Terjual: *${sold}*\n━━━━━━━━━━━━━━━━━━━━\n\nAtur jumlah lalu tekan *Beli Sekarang*\n⟲ Diperbarui pada ${now} WIB`;

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...buildProductKeyboard(productId, currentQty, inStock)
    });

    await ctx.answerCbQuery('✅ Stok & data berhasil diperbarui');
  } catch (err) {
    console.error('refresh_product error:', err.message);
    await ctx.answerCbQuery('❌ Gagal memperbarui data', { show_alert: true });
  }
});


// ── Refresh Varian (Detail Varian) ─────────────────────────────
bot.action(/^refresh_variant_(\d+)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery('🔄 Memperbarui stok...');
  } catch (e) {}

  const variantId = parseInt(ctx.match[1]);
  const cartKey = `${tenantId}_${ctx.from.id}`;

  try {
    // Ambil data terbaru dari database
    const { rows: [variant] } = await pool.query(`
      SELECT pv.*, p.name AS product_name, p.id AS product_id,
             COUNT(s.id) FILTER (WHERE s.status='available') AS stock_count,
             COUNT(s.id) FILTER (WHERE s.status='sold') AS sold_count
      FROM product_variants pv 
      LEFT JOIN stocks s ON s.variant_id = pv.id
      JOIN products p ON p.id = pv.product_id
      WHERE pv.id = $1 
        AND pv.tenant_id = $2 
        AND pv.is_active = true 
      GROUP BY pv.id, p.name, p.id
    `, [variantId, tenantId]);

    if (!variant) {
      return ctx.answerCbQuery('❌ Varian tidak ditemukan', { show_alert: true });
    }

    const stock   = parseInt(variant.stock_count || 0);
    const sold    = parseInt(variant.sold_count || 0);
    const inStock = stock > 0;
    const currentQty = userCart[cartKey]?.qty || 1;

    const now = new Date().toLocaleTimeString('id-ID', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      timeZone: 'Asia/Jakarta' 
    });

    const text = `🏷 *${variant.product_name} - ${variant.name}*\n\n📝 ${variant.description || 'Tidak ada deskripsi.'}\n\n━━━━━━━━━━━━━━━━━━━━\n💰 Harga: *Rp ${Number(variant.price).toLocaleString('id-ID')}* / akun\n📦 Stok: ${inStock ? `*${stock} tersedia* ✅` : '*Habis* ❌'}\n📊 Terjual: *${sold}*\n━━━━━━━━━━━━━━━━━━━━\n\nAtur jumlah lalu tekan *Beli Sekarang*\n⟲ Diperbarui pada ${now} WIB`;

    // Update pesan + keyboard dengan data terbaru
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...buildVariantKeyboard(variantId, currentQty, inStock, variant.product_id)
    });

    await ctx.answerCbQuery('✅ Stok & data berhasil diperbarui');
  } catch (err) {
    console.error('refresh_variant error:', err.message);
    await ctx.answerCbQuery('❌ Gagal memperbarui data', { show_alert: true });
  }
});

// ── Refresh List Varian (halaman pilih varian) ─────────────────
bot.action(/^refresh_product_variants_(\d+)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery('🔄 Memperbarui...');
  } catch (e) {}

  const productId = parseInt(ctx.match[1]);

  try {
    const { rows: [product] } = await pool.query(
      `SELECT p.*, COUNT(s.id) FILTER (WHERE s.status='sold') AS sold_count
       FROM products p 
       LEFT JOIN stocks s ON s.product_id = p.id
       WHERE p.id = $1 AND p.tenant_id = $2 AND p.is_active = true
       GROUP BY p.id`,
      [productId, tenantId]
    );

    const { rows: variants } = await pool.query(
      `SELECT pv.*, COUNT(s.id) FILTER (WHERE s.status='available') AS stock_count
       FROM product_variants pv 
       LEFT JOIN stocks s ON s.variant_id = pv.id
       WHERE pv.product_id = $1 
         AND pv.tenant_id = $2 
         AND pv.is_active = true
       GROUP BY pv.id 
       ORDER BY pv.id`,
      [productId, tenantId]
    );

    if (!product || variants.length === 0) {
      return ctx.answerCbQuery('❌ Data tidak ditemukan', { show_alert: true });
    }

    const sold = parseInt(product.sold_count || 0);
    const now = new Date().toLocaleTimeString('id-ID', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      timeZone: 'Asia/Jakarta' 
    });

    // Format yang kamu inginkan
    let text = `🏷 *${product.name}*\n\n`;
    text += `${sold} Terjual\n`;

    if (product.description && product.description.trim() !== '') {
      text += `${product.description}\n\n`;
    } else {
      text += `\n`;
    }

    variants.forEach(v => {
      const stock = parseInt(v.stock_count || 0);
      const harga = Number(v.price).toLocaleString('id-ID');
      const stokText = stock > 0 ? ` (Stok ${stock})` : ' - Habis ❌';
      text += `${v.name} - Rp ${harga}${stokText}\n`;
    });

    text += `\n⟲ Diperbarui pada ${now} WIB`;

    const variantButtons = variants.map(v => {
      const stock = parseInt(v.stock_count || 0);
      const label = stock > 0 
        ? `${v.name} - Rp ${Number(v.price).toLocaleString('id-ID')} (${stock})` 
        : `${v.name} - Habis ❌`;
      return [Markup.button.callback(label, `variant_${v.id}`)];
    });

    variantButtons.push([Markup.button.callback('🔄 Refresh', `refresh_product_variants_${productId}`)]);
    variantButtons.push([Markup.button.callback('◀️ Kembali ke Daftar', 'back_to_list')]);

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(variantButtons)
    });

    await ctx.answerCbQuery('✅ Diperbarui');
  } catch (err) {
    console.error('refresh_product_variants error:', err.message);
    await ctx.answerCbQuery('❌ Gagal memperbarui', { show_alert: true });
  }
});

  // ── HELPERS ───────────────────────────────────────────────

  async function showLoadingThenProductList(ctx) {
    const frames = ['⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%','🟦⬜⬜⬜⬜⬜⬜⬜⬜⬜ 10%','🟦🟦🟦⬜⬜⬜⬜⬜⬜⬜ 30%','🟦🟦🟦🟦🟦⬜⬜⬜⬜⬜ 50%','🟦🟦🟦🟦🟦🟦🟦⬜⬜⬜ 70%','🟦🟦🟦🟦🟦🟦🟦🟦🟦⬜ 90%','🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦 100%'];
    const msg = await ctx.reply(`⏳ Memuat produk...\n${frames[0]}`);
    for (let i = 1; i < frames.length; i++) {
      await new Promise(r => setTimeout(r, 200));
      await ctx.telegram.editMessageText(msg.chat.id, msg.message_id, null, `⏳ Memuat produk...\n${frames[i]}`).catch(() => {});
    }
    await ctx.telegram.deleteMessage(msg.chat.id, msg.message_id).catch(() => {});
    await showProductList(ctx, 1);
  }

  async function showProductList(ctx, page, messageId = null) {
    try {
      const { rows: allProducts } = await pool.query(
        `SELECT p.id, p.name, COUNT(s.id) FILTER (WHERE s.status='available') AS stock_count
         FROM products p LEFT JOIN stocks s ON s.product_id=p.id
         WHERE p.is_active=true AND p.tenant_id=$1 GROUP BY p.id ORDER BY p.id`,
        [tenantId]
      );
      if (!allProducts.length) return ctx.reply('Tidak ada produk tersedia saat ini.');

      const PAGE       = 9;
      const totalPages = Math.ceil(allProducts.length / PAGE);
      const safePage   = Math.min(Math.max(page, 1), totalPages);
      const start      = (safePage - 1) * PAGE;
      const pageItems  = allProducts.slice(start, start + PAGE);

      const key = `${tenantId}_${ctx.from.id}`;
      userProductMap[key] = { _page: safePage };
      allProducts.forEach((p, i) => { userProductMap[key][String(i + 1)] = p.id; });

      // Reply keyboard — semua angka
      const keyRows = [];
      const allNums = allProducts.map((_, i) => String(i + 1));
      for (let i = 0; i < allNums.length; i += 6) keyRows.push(allNums.slice(i, i + 6).map(n => Markup.button.text(n)));
      keyRows.unshift([Markup.button.text('🛍 Daftar Produk'), Markup.button.text('💰 Saldo Saya')]);
      keyRows.push([Markup.button.text('🏠 Menu'), Markup.button.text('🔥 Populer')]);

      // Inline — navigasi halaman
      const navRow = [];
      if (safePage > 1)          navRow.push(Markup.button.callback('← Sebelumnya', `page_${safePage - 1}`));
      if (safePage < totalPages) navRow.push(Markup.button.callback('Selanjutnya →', `page_${safePage + 1}`));
      const inlineKeyboard = navRow.length > 0 ? Markup.inlineKeyboard([navRow]) : {};

      const lines = pageItems.map((p, i) => {
        const stock = parseInt(p.stock_count) || 0;
        const emoji = stock > 0 ? '✅' : '❌';
        return `${emoji} [[${start + i + 1}]] ${p.name} (${stock})`;
      }).join('\n');
      const text = `🛒 *LIST PRODUK*\nPage ${safePage} / ${totalPages}\n\n${lines}\n\n_Ketik nomor untuk melihat detail._`;

      if (messageId) {
        try {
          await ctx.telegram.editMessageCaption(ctx.chat.id, messageId, null, text, { parse_mode: 'Markdown', ...inlineKeyboard });
          return;
        } catch {
          try {
            await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, text, { parse_mode: 'Markdown', ...inlineKeyboard });
            return;
          } catch (e) { console.error('edit error:', e.message); }
        }
      }

      // Kirim keyboard dulu agar angka muncul
      await ctx.reply('🛍', Markup.keyboard(keyRows).resize());

      const { rows: [tenantData] } = await pool.query(`SELECT banner_file_id FROM tenants WHERE id=$1`, [tenantId]);
      if (tenantData?.banner_file_id) {
        try { await ctx.replyWithPhoto(tenantData.banner_file_id, { caption: text, parse_mode: 'Markdown', ...inlineKeyboard }); return; }
        catch {}
      }
      await ctx.reply(text, { parse_mode: 'Markdown', ...inlineKeyboard });
    } catch (err) { console.error('showProductList error:', err); ctx.reply('Gagal memuat produk.'); }
  }

  async function showProductDetail(ctx, productId) {
  try {
    const { rows: [product] } = await pool.query(
      `SELECT p.*, COUNT(s.id) FILTER (WHERE s.status='available') AS stock_count,
              COUNT(s.id) FILTER (WHERE s.status='sold') AS sold_count
       FROM products p LEFT JOIN stocks s ON s.product_id=p.id
       WHERE p.id=$1 AND p.tenant_id=$2 AND p.is_active=true GROUP BY p.id`,
      [productId, tenantId]
    );

    if (!product) return ctx.reply('Produk tidak ditemukan.');

    const { rows: variants } = await pool.query(
      `SELECT pv.*, COUNT(s.id) FILTER (WHERE s.status='available') AS stock_count
       FROM product_variants pv LEFT JOIN stocks s ON s.variant_id=pv.id
       WHERE pv.product_id=$1 AND pv.tenant_id=$2 AND pv.is_active=true 
       GROUP BY pv.id ORDER BY pv.id`,
      [productId, tenantId]
    );

    const now = new Date().toLocaleTimeString('id-ID', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      timeZone: 'Asia/Jakarta' 
    });

    if (variants.length > 0) {
      // Format sesuai keinginan kamu
      const sold = parseInt(product.sold_count || 0);
      
      let text = `🏷 *${product.name}*\n\n`;                    // Baris kosong setelah nama produk
      text += `${sold} Terjual\n`;

      // Deskripsi hanya muncul jika ada isinya
      if (product.description && product.description.trim() !== '') {
        text += `${product.description}\n\n`;
      } else {
        text += `\n`;
      }

      // Daftar varian
      variants.forEach(v => {
        const stock = parseInt(v.stock_count || 0);
        const harga = Number(v.price).toLocaleString('id-ID');
        const stokText = stock > 0 ? ` (Stok ${stock})` : ' - Habis ❌';
        text += `${v.name} - Rp ${harga}${stokText}\n`;
      });

      text += `\n⟲ Diperbarui pada ${now} WIB`;

      const variantButtons = variants.map(v => {
        const stock = parseInt(v.stock_count || 0);
        const label = stock > 0 
          ? `${v.name} - Rp ${Number(v.price).toLocaleString('id-ID')} (${stock})` 
          : `${v.name} - Habis ❌`;
        return [Markup.button.callback(label, `variant_${v.id}`)];
      });

      variantButtons.push([Markup.button.callback('🔄 Refresh', `refresh_product_variants_${product.id}`)]);
      variantButtons.push([Markup.button.callback('◀️ Kembali ke Daftar', 'back_to_list')]);

      await ctx.reply(text, { 
        parse_mode: 'Markdown', 
        ...Markup.inlineKeyboard(variantButtons) 
      });

    } else {
      // Bagian tanpa varian (tetap seperti sebelumnya)
      const stock   = parseInt(product.stock_count || 0);
      const sold    = parseInt(product.sold_count || 0);
      const inStock = stock > 0;
      userCart[`${tenantId}_${ctx.from.id}`] = { productId, qty: 1, type: 'product' };

      const text = `🏷 *${product.name}*\n\n📝 ${product.description || 'Tidak ada deskripsi.'}\n\n━━━━━━━━━━━━━━━━━━━━\n💰 Harga: *Rp ${Number(product.price).toLocaleString('id-ID')}* / akun\n📦 Stok: ${inStock ? `*${stock} tersedia* ✅` : '*Habis* ❌'}\n📊 Terjual: *${sold}*\n━━━━━━━━━━━━━━━━━━━━\n\nAtur jumlah lalu tekan *Beli Sekarang*\n⟲ Diperbarui pada ${now} WIB`;

      await ctx.reply(text, { 
        parse_mode: 'Markdown', 
        ...buildProductKeyboard(productId, 1, inStock) 
      });
    }
  } catch (err) { 
    console.error('showProductDetail error:', err); 
    ctx.reply('Gagal memuat detail produk.'); 
  }
}

  async function showVariantDetail(ctx, variantId, qty = 1) {
    try {
      const { rows: [variant] } = await pool.query(
        `SELECT pv.*, p.name AS product_name, p.id AS product_id,
                COUNT(s.id) FILTER (WHERE s.status='available') AS stock_count,
                COUNT(s.id) FILTER (WHERE s.status='sold') AS sold_count
         FROM product_variants pv LEFT JOIN stocks s ON s.variant_id=pv.id
         JOIN products p ON p.id=pv.product_id
         WHERE pv.id=$1 AND pv.tenant_id=$2 AND pv.is_active=true GROUP BY pv.id, p.name, p.id`,
        [variantId, tenantId]
      );
      if (!variant) return ctx.reply('Varian tidak ditemukan.');
      const stock   = parseInt(variant.stock_count || 0);
      const sold    = parseInt(variant.sold_count || 0);
      const inStock = stock > 0;
      userCart[`${tenantId}_${ctx.from.id}`] = { variantId, qty, type: 'variant' };
      const text = `🏷 *${variant.product_name} - ${variant.name}*\n\n📝 ${variant.description || 'Tidak ada deskripsi.'}\n\n━━━━━━━━━━━━━━━━━━━━\n💰 Harga: *Rp ${Number(variant.price).toLocaleString('id-ID')}* / akun\n📦 Stok: ${inStock ? `*${stock} tersedia* ✅` : '*Habis* ❌'}\n📊 Terjual: *${sold}*\n━━━━━━━━━━━━━━━━━━━━\n\nAtur jumlah lalu tekan *Beli Sekarang*`;
      await ctx.editMessageText(text, { parse_mode: 'Markdown', ...buildVariantKeyboard(variantId, qty, inStock, variant.product_id) })
        .catch(async () => { await ctx.reply(text, { parse_mode: 'Markdown', ...buildVariantKeyboard(variantId, qty, inStock, variant.product_id) }); });
    } catch (err) { console.error('showVariantDetail error:', err); ctx.reply('Gagal memuat detail varian.'); }
  }

  function buildProductKeyboard(productId, qty, inStock) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('➖', `qty_minus_${productId}`), 
     Markup.button.callback(`  ${qty}  `, 'qty_noop'), 
     Markup.button.callback('➕', `qty_plus_${productId}`)],

    inStock 
      ? [Markup.button.callback(`🛒 Beli ${qty > 1 ? '(x'+qty+')' : ''} Sekarang`, `buy_p_${productId}`)] 
      : [Markup.button.callback('❌ Stok Habis', 'no_stock')],

    [Markup.button.callback('🎟️ Pakai Voucher', `voucher_p_${productId}`)],

    // Tombol Refresh untuk produk tanpa varian
    [Markup.button.callback('🔄 Refresh', `refresh_product_${productId}`)],

    [Markup.button.callback('◀️ Kembali ke Daftar', 'back_to_list')],
  ]);
}

  function buildVariantKeyboard(variantId, qty, inStock, productId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('➖', `qty_minus_v_${variantId}`), 
     Markup.button.callback(`  ${qty}  `, 'qty_noop'), 
     Markup.button.callback('➕', `qty_plus_v_${variantId}`)],

    inStock 
      ? [Markup.button.callback(`🛒 Beli ${qty > 1 ? '(x'+qty+')' : ''} Sekarang`, `buy_v_${variantId}`)] 
      : [Markup.button.callback('❌ Stok Habis', 'no_stock')],

    [Markup.button.callback('🎟️ Pakai Voucher', `voucher_v_${variantId}`)],

    // Tombol Refresh
    [Markup.button.callback('🔄 Refresh', `refresh_variant_${variantId}`)],

    // Tombol Kembali (paling bawah)
    [Markup.button.callback('◀️ Kembali ke Pilihan', 
      productId ? `back_to_product_${productId}` : 'back_to_list')],
  ]);
}
};