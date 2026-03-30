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

  // Helper untuk mendapatkan waktu WIB
  function getWIBTime() {
    return new Date().toLocaleTimeString('id-ID', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      timeZone: 'Asia/Jakarta' 
    });
  }

  // ── Refresh List Varian (Halaman Pilih Varian) ─────────────────
  bot.action(/^refresh_product_variants_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery('🔄 Memperbarui...'); } catch {}
    
    const productId = parseInt(ctx.match[1]);

    try {
      const { rows: [product] } = await pool.query(
        `SELECT p.*, COUNT(s.id) FILTER (WHERE s.status='sold') AS sold_count
         FROM products p 
         WHERE p.id = $1 AND p.tenant_id = $2 AND p.is_active = true 
         GROUP BY p.id`,
        [productId, tenantId]
      );

      const { rows: variants } = await pool.query(
        `SELECT pv.*, COUNT(s.id) FILTER (WHERE s.status='available') AS stock_count
         FROM product_variants pv 
         LEFT JOIN stocks s ON s.variant_id = pv.id
         WHERE pv.product_id = $1 AND pv.tenant_id = $2 AND pv.is_active = true 
         GROUP BY pv.id ORDER BY pv.id`,
        [productId, tenantId]
      );

      if (!product || variants.length === 0) {
        return ctx.answerCbQuery('❌ Data tidak ditemukan', { show_alert: true });
      }

      const sold = parseInt(product.sold_count || 0);
      const now = getWIBTime();

      const text = `🏷 *${product.name}*\n\n📝 ${product.description || 'Tidak ada deskripsi.'}\n\n━━━━━━━━━━━━━━━━━━━━\n📊 Terjual: *${sold}*\n━━━━━━━━━━━━━━━━━━━━\n\nPilih varian:\n⟲ Diperbarui pada ${now} WIB`;

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

  // ── Refresh Produk (tanpa varian) ─────────────────────────────
  bot.action(/^refresh_product_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery('🔄 Memperbarui stok...'); } catch (e) {}

    const productId = parseInt(ctx.match[1]);
    const cartKey = `${tenantId}_${ctx.from.id}`;

    try {
      const { rows: [product] } = await pool.query(
        `SELECT p.*, 
                COUNT(s.id) FILTER (WHERE s.status='available') AS stock_count,
                COUNT(s.id) FILTER (WHERE s.status='sold') AS sold_count
         FROM products p 
         LEFT JOIN stocks s ON s.product_id = p.id AND s.variant_id IS NULL
         WHERE p.id = $1 AND p.tenant_id = $2 AND p.is_active = true 
         GROUP BY p.id`,
        [productId, tenantId]
      );

      if (!product) return ctx.answerCbQuery('❌ Produk tidak ditemukan', { show_alert: true });

      const stock   = parseInt(product.stock_count || 0);
      const sold    = parseInt(product.sold_count || 0);
      const inStock = stock > 0;
      const currentQty = userCart[cartKey]?.qty || 1;
      const now = getWIBTime();

      const text = `🏷 *${product.name}*\n\n📝 ${product.description || 'Tidak ada deskripsi.'}\n\n━━━━━━━━━━━━━━━━━━━━\n💰 Harga: *Rp ${Number(product.price).toLocaleString('id-ID')}* / akun\n📦 Stok: ${inStock ? `*${stock} tersedia* ✅` : '*Habis* ❌'}\n📊 Terjual: *${sold}*\n━━━━━━━━━━━━━━━━━━━━\n\nAtur jumlah lalu tekan *Beli Sekarang*\n⟲ Diperbarui pada ${now} WIB`;

      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...buildProductKeyboard(productId, currentQty, inStock)
      });

      await ctx.answerCbQuery('✅ Diperbarui');
    } catch (err) {
      console.error('refresh_product error:', err.message);
      await ctx.answerCbQuery('❌ Gagal memperbarui data', { show_alert: true });
    }
  });

  // ── Refresh Varian (Detail Varian) ───────────────────────────
  bot.action(/^refresh_variant_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery('🔄 Memperbarui stok...'); } catch (e) {}

    const variantId = parseInt(ctx.match[1]);
    const cartKey = `${tenantId}_${ctx.from.id}`;

    try {
      const { rows: [variant] } = await pool.query(`
        SELECT pv.*, p.name AS product_name, p.id AS product_id,
               COUNT(s.id) FILTER (WHERE s.status='available') AS stock_count,
               COUNT(s.id) FILTER (WHERE s.status='sold') AS sold_count
        FROM product_variants pv 
        LEFT JOIN stocks s ON s.variant_id = pv.id
        JOIN products p ON p.id = pv.product_id
        WHERE pv.id = $1 AND pv.tenant_id = $2 AND pv.is_active = true 
        GROUP BY pv.id, p.name, p.id
      `, [variantId, tenantId]);

      if (!variant) return ctx.answerCbQuery('❌ Varian tidak ditemukan', { show_alert: true });

      const stock   = parseInt(variant.stock_count || 0);
      const sold    = parseInt(variant.sold_count || 0);
      const inStock = stock > 0;
      const currentQty = userCart[cartKey]?.qty || 1;
      const now = getWIBTime();

      const text = `🏷 *${variant.product_name} - ${variant.name}*\n\n📝 ${variant.description || 'Tidak ada deskripsi.'}\n\n━━━━━━━━━━━━━━━━━━━━\n💰 Harga: *Rp ${Number(variant.price).toLocaleString('id-ID')}* / akun\n📦 Stok: ${inStock ? `*${stock} tersedia* ✅` : '*Habis* ❌'}\n📊 Terjual: *${sold}*\n━━━━━━━━━━━━━━━━━━━━\n\nAtur jumlah lalu tekan *Beli Sekarang*\n⟲ Diperbarui pada ${now} WIB`;

      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...buildVariantKeyboard(variantId, currentQty, inStock, variant.product_id)
      });

      await ctx.answerCbQuery('✅ Diperbarui');
    } catch (err) {
      console.error('refresh_variant error:', err.message);
      await ctx.answerCbQuery('❌ Gagal memperbarui data', { show_alert: true });
    }
  });

  // ── HELPERS ───────────────────────────────────────────────

  async function showLoadingThenProductList(ctx) { /* ... tetap sama ... */ }

  async function showProductList(ctx, page, messageId = null) { /* ... tetap sama ... */ }

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
         WHERE pv.product_id=$1 AND pv.tenant_id=$2 AND pv.is_active=true GROUP BY pv.id ORDER BY pv.id`,
        [productId, tenantId]
      );

      if (variants.length > 0) {
        const sold = parseInt(product.sold_count || 0);
        const now = getWIBTime();
        const text = `🏷 *${product.name}*\n\n📝 ${product.description || 'Tidak ada deskripsi.'}\n\n━━━━━━━━━━━━━━━━━━━━\n📊 Terjual: *${sold}*\n━━━━━━━━━━━━━━━━━━━━\n\nPilih varian:\n⟲ Diperbarui pada ${now} WIB`;

        const variantButtons = variants.map(v => {
          const stock = parseInt(v.stock_count || 0);
          const label = stock > 0 
            ? `${v.name} - Rp ${Number(v.price).toLocaleString('id-ID')} (${stock})` 
            : `${v.name} - Habis ❌`;
          return [Markup.button.callback(label, `variant_${v.id}`)];
        });

        variantButtons.push([Markup.button.callback('🔄 Refresh', `refresh_product_variants_${product.id}`)]);
        variantButtons.push([Markup.button.callback('◀️ Kembali ke Daftar', 'back_to_list')]);

        await ctx.reply(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(variantButtons) });
      } else {
        const stock   = parseInt(product.stock_count || 0);
        const sold    = parseInt(product.sold_count || 0);
        const inStock = stock > 0;
        userCart[`${tenantId}_${ctx.from.id}`] = { productId, qty: 1, type: 'product' };
        const now = getWIBTime();
        const text = `🏷 *${product.name}*\n\n📝 ${product.description || 'Tidak ada deskripsi.'}\n\n━━━━━━━━━━━━━━━━━━━━\n💰 Harga: *Rp ${Number(product.price).toLocaleString('id-ID')}* / akun\n📦 Stok: ${inStock ? `*${stock} tersedia* ✅` : '*Habis* ❌'}\n📊 Terjual: *${sold}*\n━━━━━━━━━━━━━━━━━━━━\n\nAtur jumlah lalu tekan *Beli Sekarang*\n⟲ Diperbarui pada ${now} WIB`;

        await ctx.reply(text, { parse_mode: 'Markdown', ...buildProductKeyboard(productId, 1, inStock) });
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
      const now = getWIBTime();

      const text = `🏷 *${variant.product_name} - ${variant.name}*\n\n📝 ${variant.description || 'Tidak ada deskripsi.'}\n\n━━━━━━━━━━━━━━━━━━━━\n💰 Harga: *Rp ${Number(variant.price).toLocaleString('id-ID')}* / akun\n📦 Stok: ${inStock ? `*${stock} tersedia* ✅` : '*Habis* ❌'}\n📊 Terjual: *${sold}*\n━━━━━━━━━━━━━━━━━━━━\n\nAtur jumlah lalu tekan *Beli Sekarang*\n⟲ Diperbarui pada ${now} WIB`;

      await ctx.editMessageText(text, { 
        parse_mode: 'Markdown', 
        ...buildVariantKeyboard(variantId, qty, inStock, variant.product_id) 
      }).catch(async () => {
        await ctx.reply(text, { 
          parse_mode: 'Markdown', 
          ...buildVariantKeyboard(variantId, qty, inStock, variant.product_id) 
        });
      });
    } catch (err) { 
      console.error('showVariantDetail error:', err); 
      ctx.reply('Gagal memuat detail varian.'); 
    }
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
      [Markup.button.callback('🔄 Refresh', `refresh_variant_${variantId}`)],
      [Markup.button.callback('◀️ Kembali ke Pilihan', 
        productId ? `back_to_product_${productId}` : 'back_to_list')],
    ]);
  }
};