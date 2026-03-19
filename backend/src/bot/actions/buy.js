// Ganti bagian pay_qris di buy.js — ambil config berdasarkan payment_gateway tenant

bot.action(/^pay_qris_(\d+)_(\d+)$/, async (ctx) => {
  try { await ctx.answerCbQuery(); } catch {}
  const productId  = parseInt(ctx.match[1]);
  const qty        = parseInt(ctx.match[2]);
  const telegramId = ctx.from.id;

  try {
    const { rows: [user] } = await db.query(
      'SELECT id, tenant_id FROM users WHERE telegram_id=$1', [telegramId]);
    if (!user) return ctx.editMessageText('Silakan kirim /start terlebih dahulu.').catch(() => {});

    const { rows: [product] } = await db.query(
      'SELECT * FROM products WHERE id=$1 AND is_active=true', [productId]);
    if (!product) return ctx.editMessageText('Produk tidak ditemukan.').catch(() => {});

    const tenantId = user.tenant_id || product.tenant_id;

    // Ambil semua config gateway dari tenant
    const { rows: [tenant] } = await db.query(
      `SELECT tripay_api_key, tripay_private_key, tripay_merchant_code, tripay_mode,
              pakasir_api_key, pakasir_project_slug, payment_gateway
       FROM tenants WHERE id=$1`, [tenantId]);

    if (!tenant) return ctx.reply('❌ Konfigurasi tidak ditemukan.');

    const { rows: [sc] } = await db.query(
      `SELECT COUNT(*) AS cnt FROM stocks WHERE product_id=$1 AND status='available'`, [productId]);
    if (parseInt(sc.cnt) < qty)
      return ctx.editMessageText(`❌ Stok tidak cukup. Tersedia: ${sc.cnt} akun.`).catch(() => {});

    const { rows: [existing] } = await db.query(
      `SELECT id, payment_url FROM orders
       WHERE user_id=$1 AND product_id=$2 AND status='pending'
         AND created_at > NOW() - INTERVAL '2 hours'`, [user.id, productId]);
    if (existing) {
      return ctx.editMessageText('⚠️ Kamu masih punya pesanan yang belum dibayar.',
        Markup.inlineKeyboard([[Markup.button.url('💳 Bayar Sekarang', existing.payment_url)]])
      ).catch(() => {});
    }

    const total          = product.price * qty;
    const paymentOrderId = `ORDER-${Date.now()}-${user.id}`;

    // Tentukan gateway dan config
    const gateway = tenant.payment_gateway || 'tripay';
    let config;

    if (gateway === 'pakasir') {
      if (!tenant.pakasir_api_key) return ctx.reply('❌ Pakasir belum dikonfigurasi. Hubungi admin.');
      config = {
        gateway      : 'pakasir',
        api_key      : tenant.pakasir_api_key,
        project_slug : tenant.pakasir_project_slug,
      };
    } else {
      if (!tenant.tripay_api_key) return ctx.reply('❌ Tripay belum dikonfigurasi. Hubungi admin.');
      config = {
        gateway      : 'tripay',
        api_key      : tenant.tripay_api_key,
        private_key  : tenant.tripay_private_key,
        merchant_code: tenant.tripay_merchant_code,
        mode         : tenant.tripay_mode || 'sandbox',
      };
    }

    const { payment_url } = await createPayment(config, {
      orderId     : paymentOrderId,
      amount      : total,
      productName : `${product.name} x${qty}`,
      customerName: ctx.from.first_name || 'Customer',
    });

    await db.query(
      `INSERT INTO orders (user_id, product_id, payment_id, payment_url, amount, status, qty, tenant_id)
       VALUES ($1,$2,$3,$4,$5,'pending',$6,$7)`,
      [user.id, productId, paymentOrderId, payment_url, total, qty, tenantId]);

    const gatewayLabel = gateway === 'pakasir' ? 'QRIS (Pakasir)' : 'QRIS/Transfer (Tripay)';
    await ctx.editMessageText(
      `🧾 *Pesanan Dibuat!*\n\n` +
      `📦 ${product.name} x${qty}\n` +
      `💰 Total: *Rp ${Number(total).toLocaleString('id-ID')}*\n` +
      `💳 Metode: ${gatewayLabel}\n\n` +
      `Klik tombol di bawah untuk membayar.\n⏰ Link berlaku *2 jam*.`,
      { parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.url('💳 Bayar Sekarang', payment_url)]]) }
    );
  } catch (err) {
    console.error('pay_qris error:', err.response?.data || err.message);
    ctx.editMessageText('❌ Gagal membuat pembayaran. Coba lagi.').catch(() => {});
  }
});