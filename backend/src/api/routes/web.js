const express = require('express');
const router  = express.Router();
const { pool } = require('../../db/pool');
const { createPayment } = require('../../services/paymentService');

// ── Helper: ambil config payment tenant ──────────────────────────
async function getTenantPaymentConfig(tenantId) {
  const { rows: [tenant] } = await pool.query(
    `SELECT payment_gateway, tripay_api_key, tripay_private_key, tripay_merchant_code, tripay_mode,
            pakasir_api_key, pakasir_project_slug
     FROM tenants WHERE id=$1`,
    [tenantId]
  );
  if (!tenant) throw new Error('Tenant not found');

  const gateway = tenant.payment_gateway || 'tripay';

  return {
    gateway,
    // api_key disesuaikan dengan gateway
    api_key      : gateway === 'pakasir' ? tenant.pakasir_api_key : tenant.tripay_api_key,
    private_key  : tenant.tripay_private_key,
    merchant_code: tenant.tripay_merchant_code,
    mode         : tenant.tripay_mode || 'sandbox',
    project_slug : tenant.pakasir_project_slug,
  };
}

// ── Helper: deliver web order (simpan ke DB, tidak kirim ke Telegram) ──
async function deliverWebOrder(webOrder, tenantId) {
  const qty = webOrder.qty || 1;

  // Cek sudah terdeliver?
  if (webOrder.delivered) return { success: true, reason: 'already_delivered' };

  // Ambil stok
  const stockQuery = webOrder.variant_id
    ? `SELECT id, email, password, content FROM stocks
       WHERE variant_id=$1 AND status='available' AND tenant_id=$2 LIMIT $3`
    : `SELECT id, email, password, content FROM stocks
       WHERE product_id=$1 AND variant_id IS NULL AND status='available' AND tenant_id=$2 LIMIT $3`;

  const stockParam = webOrder.variant_id
    ? [webOrder.variant_id, tenantId, qty]
    : [webOrder.product_id, tenantId, qty];

  const { rows: stocks } = await pool.query(stockQuery, stockParam);

  if (stocks.length < qty) {
    // Notif admin lewat Telegram (bot tetap jalan)
    try {
      const { getBotByTenantId } = require('../../bot/tenantManager');
      const bot = getBotByTenantId(tenantId);
      if (bot) {
        const { rows: [t] } = await pool.query(
          `SELECT admin_telegram_id FROM tenants WHERE id=$1`, [tenantId]
        );
        if (t?.admin_telegram_id) {
          await bot.telegram.sendMessage(
            t.admin_telegram_id,
            `⚠️ STOK HABIS! Web Order #${webOrder.id} (${webOrder.buyer_email})`
          );
        }
      }
    } catch (e) { console.warn('notif admin stok habis:', e.message); }
    return { success: false, reason: 'out_of_stock' };
  }

  const isBundle = !!stocks[0].content;
  let deliveryText = '';

  if (isBundle) {
    deliveryText = stocks.map((s, i) => `${i + 1}. ${s.content}`).join('\n');
  } else {
    deliveryText = stocks.map((s, i) =>
`AKUN ${i + 1}
Email    : ${s.email}
Password : ${s.password}`
    ).join('\n\n');
  }

  // Mark stok sebagai sold
  const ids = stocks.map(s => s.id);
  await pool.query(
    `UPDATE stocks SET status='sold', order_id=NULL WHERE id = ANY($1)`,
    [ids]
  );

  // Simpan delivery content ke web_orders
  await pool.query(
    `UPDATE web_orders SET delivered=true, delivery_content=$1, paid_at=NOW()
     WHERE id=$2`,
    [deliveryText, webOrder.id]
  );

  // Notif admin lewat bot bahwa ada order web baru
  try {
    const { getBotByTenantId } = require('../../bot/tenantManager');
    const bot = getBotByTenantId(tenantId);
    if (bot) {
      const { rows: [t] } = await pool.query(
        `SELECT admin_telegram_id FROM tenants WHERE id=$1`, [tenantId]
      );
      const adminId = t?.admin_telegram_id;
      if (adminId) {
        const { rows: [info] } = await pool.query(
          `SELECT p.name AS product_name, pv.name AS variant_name
           FROM web_orders wo
           JOIN products p ON p.id = wo.product_id
           LEFT JOIN product_variants pv ON pv.id = wo.variant_id
           WHERE wo.id=$1`, [webOrder.id]
        );
        const prodLabel = info?.variant_name
          ? `${info.product_name} - ${info.variant_name}`
          : info?.product_name || '?';

        await bot.telegram.sendMessage(
          adminId,
          `🌐 *Web Order Baru!*\n\n` +
          `🧾 ID: *#WEB-${webOrder.id}*\n` +
          `📦 Produk: *${prodLabel}*\n` +
          `👤 Pembeli: ${webOrder.buyer_email}\n` +
          `🛍 Qty: *${qty}*\n` +
          `💰 Total: *Rp ${Number(webOrder.amount).toLocaleString('id-ID')}*`,
          { parse_mode: 'Markdown' }
        );
      }
    }
  } catch (e) { console.warn('notif admin web order:', e.message); }

  return { success: true };
}

// ══════════════════════════════════════════════════════════════════
// GET /api/web/products?tenant_id=X
// ══════════════════════════════════════════════════════════════════
router.get('/products', async (req, res) => {
  const { tenant_id } = req.query;
  if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });

  try {
    const { rows: products } = await pool.query(
      `SELECT p.id, p.name, p.description, p.price, p.terms,
              COUNT(s.id) FILTER (WHERE s.status='available' AND s.tenant_id=$1) AS stock_count
       FROM products p
       LEFT JOIN stocks s ON s.product_id = p.id AND s.tenant_id = $1
       WHERE p.is_active = true AND p.tenant_id = $1
       GROUP BY p.id ORDER BY p.id`,
      [tenant_id]
    );

    // Ambil variants untuk setiap produk
    for (const p of products) {
      const { rows: variants } = await pool.query(
        `SELECT pv.id, pv.name, pv.description, pv.price, pv.terms, pv.is_active,
                COUNT(s.id) FILTER (WHERE s.status='available') AS stock_count
         FROM product_variants pv
         LEFT JOIN stocks s ON s.variant_id = pv.id AND s.tenant_id = $2
         WHERE pv.product_id = $1 AND pv.tenant_id = $2 AND pv.is_active = true
         GROUP BY pv.id ORDER BY pv.id`,
        [p.id, tenant_id]
      );
      p.variants = variants;
    }

    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal ambil produk' });
  }
});

// ══════════════════════════════════════════════════════════════════
// GET /api/web/tenant?tenant_id=X  (info toko)
// ══════════════════════════════════════════════════════════════════
router.get('/tenant', async (req, res) => {
  const { tenant_id } = req.query;
  if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });

  try {
    const { rows: [tenant] } = await pool.query(
      `SELECT id, name, banner_file_id, terms, help_text, payment_gateway
       FROM tenants WHERE id=$1 AND status='active'`,
      [tenant_id]
    );
    if (!tenant) return res.status(404).json({ error: 'Toko tidak ditemukan' });
    res.json(tenant);
  } catch (err) {
    res.status(500).json({ error: 'Gagal ambil info toko' });
  }
});

// ══════════════════════════════════════════════════════════════════
// POST /api/web/order  (buat order dari website)
// Body: { tenant_id, product_id, variant_id?, qty, buyer_email, buyer_name }
// ══════════════════════════════════════════════════════════════════
router.post('/order', async (req, res) => {
  const { tenant_id, product_id, variant_id, qty = 1, buyer_email, buyer_name } = req.body;

  if (!tenant_id || !product_id || !buyer_email) {
    return res.status(400).json({ error: 'tenant_id, product_id, buyer_email required' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(buyer_email)) {
    return res.status(400).json({ error: 'Format email tidak valid' });
  }

  if (qty < 1 || qty > 10) {
    return res.status(400).json({ error: 'Qty harus antara 1-10' });
  }

  try {
    // Cek stok cukup
    const stockQuery = variant_id
      ? `SELECT COUNT(*) AS cnt FROM stocks WHERE variant_id=$1 AND status='available' AND tenant_id=$2`
      : `SELECT COUNT(*) AS cnt FROM stocks WHERE product_id=$1 AND variant_id IS NULL AND status='available' AND tenant_id=$2`;
    const stockParam = variant_id ? [variant_id, tenant_id] : [product_id, tenant_id];
    const { rows: [sc] } = await pool.query(stockQuery, stockParam);
    if (parseInt(sc.cnt) < qty) {
      return res.status(400).json({ error: `Stok tidak cukup. Tersedia: ${sc.cnt}` });
    }

    // Ambil harga
    let price;
    if (variant_id) {
      const { rows: [v] } = await pool.query(
        `SELECT price FROM product_variants WHERE id=$1 AND tenant_id=$2`,
        [variant_id, tenant_id]
      );
      if (!v) return res.status(404).json({ error: 'Varian tidak ditemukan' });
      price = v.price;
    } else {
      const { rows: [p] } = await pool.query(
        `SELECT price FROM products WHERE id=$1 AND tenant_id=$2 AND is_active=true`,
        [product_id, tenant_id]
      );
      if (!p) return res.status(404).json({ error: 'Produk tidak ditemukan' });
      price = p.price;
    }

    const amount = price * qty;

    // Buat web_order record
    const { rows: [webOrder] } = await pool.query(
      `INSERT INTO web_orders (tenant_id, product_id, variant_id, buyer_email, buyer_name, qty, amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [tenant_id, product_id, variant_id || null, buyer_email, buyer_name || null, qty, amount]
    );

    const paymentId = `WEB-${webOrder.id}-${Date.now()}`;

    // Buat payment
    const config = await getTenantPaymentConfig(tenant_id);
    const payment = await createPayment(config, {
      orderId     : paymentId,
      amount,
      productName : `Order #WEB-${webOrder.id}`,
      customerName: buyer_name || buyer_email,
    });

    // Update order dengan payment info
    const expiredAt = new Date(Date.now() + 15 * 60 * 1000); // 15 menit
    await pool.query(
      `UPDATE web_orders SET payment_id=$1, payment_url=$2, payment_gateway=$3, expired_at=$4 WHERE id=$5`,
      [paymentId, payment.payment_url, config.gateway, expiredAt, webOrder.id]
    );

    res.json({
      order_id       : webOrder.id,
      payment_id     : paymentId,
      amount,
      payment_url    : payment.payment_url,
      payment_number : payment.payment_number || null, // untuk Pakasir QRIS
      gateway        : config.gateway,
      expired_at     : expiredAt,
    });

  } catch (err) {
    console.error('web order error:', err);
    res.status(500).json({ error: err.message || 'Gagal buat order' });
  }
});

// ══════════════════════════════════════════════════════════════════
// GET /api/web/order/:id?tenant_id=X  (cek status order)
// ══════════════════════════════════════════════════════════════════
router.get('/order/:id', async (req, res) => {
  const { tenant_id } = req.query;
  try {
    const { rows: [order] } = await pool.query(
      `SELECT wo.id, wo.status, wo.amount, wo.qty, wo.buyer_email, wo.buyer_name,
              wo.payment_id, wo.payment_url, wo.payment_gateway,
              wo.delivered, wo.delivery_content, wo.created_at, wo.paid_at, wo.expired_at,
              p.name AS product_name, p.terms AS product_terms,
              pv.name AS variant_name, pv.terms AS variant_terms
       FROM web_orders wo
       JOIN products p ON p.id = wo.product_id
       LEFT JOIN product_variants pv ON pv.id = wo.variant_id
       WHERE wo.id=$1 ${tenant_id ? 'AND wo.tenant_id=$2' : ''}`,
      tenant_id ? [req.params.id, tenant_id] : [req.params.id]
    );
    if (!order) return res.status(404).json({ error: 'Order tidak ditemukan' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// POST /api/web/webhook/tripay  — webhook Tripay untuk web orders
// ══════════════════════════════════════════════════════════════════
router.post('/webhook/tripay', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const rawBody = req.body.toString('utf8');
    const payload = JSON.parse(rawBody);
    const { merchant_ref, status } = payload;

    if (status !== 'PAID') return res.json({ status: 'ignored' });
    if (!merchant_ref.startsWith('WEB-')) return res.json({ status: 'not_web_order' });

    const { rows: [webOrder] } = await pool.query(
      `UPDATE web_orders SET status='paid' WHERE payment_id=$1 AND status='pending' RETURNING *`,
      [merchant_ref]
    );
    if (!webOrder) return res.json({ status: 'not found or processed' });

    await deliverWebOrder(webOrder, webOrder.tenant_id);
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('web tripay webhook error:', err);
    res.status(500).json({ error: 'Failed' });
  }
});

// ══════════════════════════════════════════════════════════════════
// POST /api/web/webhook/pakasir  — webhook Pakasir untuk web orders
// ══════════════════════════════════════════════════════════════════
router.post('/webhook/pakasir', express.json(), async (req, res) => {
  res.json({ status: 'received' });

  try {
    const body    = req.body;
    const orderId = body.order_id || body.merchant_ref || body.reference || body.id;
    const status  = body.status   || body.payment_status || body.transaction_status;

    if (!orderId || !orderId.startsWith('WEB-')) return;

    const PAID_STATUSES = ['completed', 'paid', 'success', 'PAID', 'SUCCESS', 'settlement', 'capture'];
    if (!PAID_STATUSES.includes(status)) return;

    const { rows: [webOrder] } = await pool.query(
      `UPDATE web_orders SET status='paid' WHERE payment_id=$1 AND status='pending' RETURNING *`,
      [orderId]
    );
    if (!webOrder) return;

    await deliverWebOrder(webOrder, webOrder.tenant_id);
  } catch (err) {
    console.error('web pakasir webhook error:', err);
  }
});

// ══════════════════════════════════════════════════════════════════
// Auto expire web orders pending > 15 menit (dipanggil dari app.js)
// ══════════════════════════════════════════════════════════════════
async function autoExpireWebOrders() {
  try {
    const { rows: expired } = await pool.query(
      `UPDATE web_orders SET status='expired'
       WHERE status='pending' AND expired_at < NOW()
       RETURNING id`
    );
    if (expired.length > 0) {
      console.log(`⏰ Auto expired ${expired.length} web order(s)`);
    }
  } catch (err) {
    console.error('web order auto expire error:', err.message);
  }
}

module.exports = router;
module.exports.autoExpireWebOrders = autoExpireWebOrders;
