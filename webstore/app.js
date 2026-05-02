/* ─────────────────────────────────────────────
   CONFIG
   Karena webstore di-serve langsung dari backend Railway,
   API_BASE otomatis sama dengan URL website ini.
   Ganti TENANT_ID sesuai ID tenant kamu di database.
   ───────────────────────────────────────────── */
const CONFIG = {
  API_BASE : window.location.origin,   // otomatis: Railway URL / localhost
  TENANT_ID: 1,                         // ← sesuaikan ID tenant
};

/* ─────────────────────────────────────────────
   STATE
   ───────────────────────────────────────────── */
let state = {
  products      : [],
  selectedProduct: null,
  selectedVariant: null,
  qty           : 1,
  currentOrder  : null,   // { order_id, payment_id, amount, payment_url, payment_number, gateway, expired_at }
  pollTimer     : null,
  countdownTimer: null,
};

/* ─────────────────────────────────────────────
   INIT
   ───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('year').textContent = new Date().getFullYear();
  loadTenantInfo();
  loadProducts();
});

async function loadTenantInfo() {
  try {
    const res  = await fetch(`${CONFIG.API_BASE}/api/web/tenant?tenant_id=${CONFIG.TENANT_ID}`);
    if (!res.ok) return;
    const info = await res.json();

    if (info.name) {
      document.getElementById('shop-name').textContent         = info.name;
      document.getElementById('footer-shop-name').textContent  = info.name;
      document.title = `${info.name} — Toko Digital`;
    }
  } catch (e) { /* silent */ }
}

async function loadProducts() {
  try {
    const res  = await fetch(`${CONFIG.API_BASE}/api/web/products?tenant_id=${CONFIG.TENANT_ID}`);
    const data = await res.json();
    state.products = Array.isArray(data) ? data : [];
    renderProducts();
  } catch (e) {
    renderProducts([]);
  }
}

/* ─────────────────────────────────────────────
   RENDER PRODUCTS
   ───────────────────────────────────────────── */
function renderProducts() {
  const grid  = document.getElementById('products-grid');
  const empty = document.getElementById('empty-state');
  const prods = state.products;

  grid.innerHTML = '';

  if (!prods.length) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  prods.forEach(p => {
    const hasVariants   = p.variants && p.variants.length > 0;
    const stockCount    = hasVariants
      ? p.variants.reduce((s, v) => s + parseInt(v.stock_count || 0), 0)
      : parseInt(p.stock_count || 0);
    const outOfStock    = stockCount === 0;
    const stockClass    = outOfStock ? 'stock-empty' : (stockCount < 5 ? 'stock-low' : 'stock-ok');
    const stockLabel    = outOfStock ? '❌ Habis' : `✅ ${stockCount} tersedia`;
    const priceLabel    = hasVariants ? `Mulai ${fmtRp(Math.min(...p.variants.map(v => v.price)))}` : fmtRp(p.price);
    const icons         = ['📦','💎','⚡','🎮','🎯','🌟','🔑','🎁','🛡️','💻'];
    const icon          = icons[p.id % icons.length];

    const card = document.createElement('div');
    card.className = 'product-card';
    card.id = `product-card-${p.id}`;
    card.innerHTML = `
      ${hasVariants ? '<span class="has-variants-badge">Pilih Varian</span>' : ''}
      <div class="product-card-icon">${icon}</div>
      <div class="product-card-name">${esc(p.name)}</div>
      ${p.description ? `<div class="product-card-desc">${esc(p.description)}</div>` : ''}
      <div class="product-card-footer">
        <span class="product-card-price">${priceLabel}</span>
        <span class="product-card-stock ${stockClass}">${stockLabel}</span>
      </div>
      <button class="card-buy-btn" ${outOfStock ? 'disabled' : ''} onclick="openProductModal(${p.id})">
        ${outOfStock ? '😔 Stok Habis' : '🛒 Beli Sekarang'}
      </button>
    `;
    grid.appendChild(card);
  });
}

/* ─────────────────────────────────────────────
   PRODUCT MODAL
   ───────────────────────────────────────────── */
function openProductModal(productId) {
  const p = state.products.find(x => x.id === productId);
  if (!p) return;

  state.selectedProduct = p;
  state.selectedVariant  = null;
  state.qty              = 1;

  // Reset steps
  showStep('detail');

  // Fill detail
  const icons = ['📦','💎','⚡','🎮','🎯','🌟','🔑','🎁','🛡️','💻'];
  document.getElementById('modal-product-icon').textContent  = icons[p.id % icons.length];
  document.getElementById('modal-product-name').textContent  = p.name;

  const hasVariants = p.variants && p.variants.length > 0;

  // Variants
  const variantSection = document.getElementById('modal-variants-section');
  const variantGrid    = document.getElementById('modal-variants-grid');
  if (hasVariants) {
    variantSection.style.display = 'block';
    variantGrid.innerHTML = '';
    p.variants.forEach(v => {
      const btn = document.createElement('button');
      btn.className = 'variant-btn';
      btn.id = `variant-btn-${v.id}`;
      btn.disabled = parseInt(v.stock_count) === 0;
      btn.innerHTML = `
        <span class="variant-name">${esc(v.name)}</span>
        <span class="variant-price">${fmtRp(v.price)}</span>
        <span class="variant-stock">${parseInt(v.stock_count)} tersedia</span>
      `;
      btn.onclick = () => selectVariant(v);
      variantGrid.appendChild(btn);
    });
    // Harga awal: tampilkan range
    document.getElementById('modal-product-price').textContent =
      `Mulai ${fmtRp(Math.min(...p.variants.map(v => v.price)))}`;
  } else {
    variantSection.style.display = 'none';
    document.getElementById('modal-product-price').textContent = fmtRp(p.price);
  }

  // Description
  const descSection = document.getElementById('modal-desc-section');
  if (p.description) {
    descSection.style.display = 'block';
    document.getElementById('modal-product-desc').textContent = p.description;
  } else {
    descSection.style.display = 'none';
  }

  // Terms
  const termsSection = document.getElementById('modal-terms-section');
  const termsText    = p.terms;
  if (termsText) {
    termsSection.style.display = 'block';
    document.getElementById('modal-terms-text').textContent = termsText;
  } else {
    termsSection.style.display = 'none';
  }

  updateQtyDisplay();
  document.getElementById('product-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function selectVariant(v) {
  state.selectedVariant = v;

  // Highlight
  document.querySelectorAll('.variant-btn').forEach(b => b.classList.remove('selected'));
  const btn = document.getElementById(`variant-btn-${v.id}`);
  if (btn) btn.classList.add('selected');

  // Update price & terms
  document.getElementById('modal-product-price').textContent = fmtRp(v.price);

  const termsSection = document.getElementById('modal-terms-section');
  const termsTxt     = v.terms || state.selectedProduct?.terms;
  if (termsTxt) {
    termsSection.style.display = 'block';
    document.getElementById('modal-terms-text').textContent = termsTxt;
  } else {
    termsSection.style.display = 'none';
  }

  state.qty = 1;
  updateQtyDisplay();
}

function changeQty(delta) {
  const p    = state.selectedProduct;
  const v    = state.selectedVariant;
  const hasV = p.variants && p.variants.length > 0;

  const maxStock = hasV
    ? (v ? parseInt(v.stock_count) : 0)
    : parseInt(p.stock_count || 0);

  const newQty = state.qty + delta;
  if (newQty < 1) return;
  if (newQty > Math.min(maxStock, 10)) return;
  state.qty = newQty;
  updateQtyDisplay();
}

function updateQtyDisplay() {
  const p    = state.selectedProduct;
  const v    = state.selectedVariant;
  const hasV = p?.variants && p.variants.length > 0;

  const maxStock = hasV
    ? (v ? parseInt(v.stock_count) : 0)
    : parseInt(p?.stock_count || 0);

  document.getElementById('qty-display').textContent   = state.qty;
  document.getElementById('qty-stock-info').textContent = `Stok tersedia: ${maxStock}`;

  // Price
  const pricePerUnit = v ? v.price : p?.price || 0;
  const total        = pricePerUnit * state.qty;
  document.getElementById('modal-total-price').textContent = fmtRp(total);

  // Disable buy if no variant selected
  const noVariantSelected = hasV && !v;
  document.getElementById('btn-buy').disabled = noVariantSelected || maxStock === 0;

  document.getElementById('qty-minus').disabled = state.qty <= 1;
  document.getElementById('qty-plus').disabled  = state.qty >= Math.min(maxStock, 10);
}

function goToCheckout() {
  const p = state.selectedProduct;
  const v = state.selectedVariant;
  if (!p) return;

  const hasVariants = p.variants && p.variants.length > 0;
  if (hasVariants && !v) { showToast('Pilih varian terlebih dahulu'); return; }

  const pricePerUnit = v ? v.price : p.price;
  const total        = pricePerUnit * state.qty;
  const prodLabel    = v ? `${p.name} - ${v.name}` : p.name;

  document.getElementById('summary-product').textContent = prodLabel;
  document.getElementById('summary-qty').textContent     = `${state.qty}x`;
  document.getElementById('summary-total').textContent   = fmtRp(total);

  document.getElementById('checkout-error').style.display = 'none';
  showStep('checkout');
}

function goBackToDetail() { showStep('detail'); }

function closeProductModal(e) {
  if (e && e.target !== document.getElementById('product-modal')) return;
  _closeProductModal();
}

function _closeProductModal() {
  document.getElementById('product-modal').classList.remove('open');
  document.body.style.overflow = '';
  clearTimers();
}

/* ─────────────────────────────────────────────
   SUBMIT ORDER
   ───────────────────────────────────────────── */
async function submitOrder() {
  const email = document.getElementById('buyer-email').value.trim();
  const name  = document.getElementById('buyer-name').value.trim();
  const errEl = document.getElementById('checkout-error');
  errEl.style.display = 'none';

  if (!email) { showErr(errEl, 'Email wajib diisi'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showErr(errEl, 'Format email tidak valid'); return; }

  const p = state.selectedProduct;
  const v = state.selectedVariant;

  const btn = document.getElementById('btn-confirm');
  btn.disabled = true;
  btn.textContent = '⏳ Memproses...';

  try {
    const body = {
      tenant_id : CONFIG.TENANT_ID,
      product_id: p.id,
      variant_id: v ? v.id : undefined,
      qty       : state.qty,
      buyer_email: email,
      buyer_name : name || undefined,
    };

    const res  = await fetch(`${CONFIG.API_BASE}/api/web/order`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) { showErr(errEl, data.error || 'Gagal membuat order'); return; }

    state.currentOrder = data;
    showPaymentStep(data);

  } catch (e) {
    showErr(errEl, 'Koneksi gagal, coba lagi');
  } finally {
    btn.disabled = false;
    btn.textContent = '💳 Lanjut ke Pembayaran';
  }
}

/* ─────────────────────────────────────────────
   PAYMENT STEP
   ───────────────────────────────────────────── */
function showPaymentStep(order) {
  showStep('payment');

  document.getElementById('display-order-id').textContent = `#WEB-${order.order_id}`;
  document.getElementById('payment-success-content').style.display = 'none';
  document.getElementById('payment-spinner').style.display = 'block';
  document.getElementById('payment-check').style.display   = 'none';
  document.getElementById('payment-status-title').textContent = 'Menunggu Pembayaran';
  document.getElementById('payment-status-desc').textContent  = 'Selesaikan pembayaran sebelum waktu habis';

  // Pakasir QRIS
  if (order.payment_number) {
    document.getElementById('payment-qris-section').style.display = 'block';
    document.getElementById('payment-url-section').style.display  = 'none';
    document.getElementById('qris-code-text').textContent = order.payment_number;
  } else if (order.payment_url) {
    document.getElementById('payment-url-section').style.display  = 'block';
    document.getElementById('payment-qris-section').style.display = 'none';
    document.getElementById('payment-link-btn').href = order.payment_url;
  }

  // Timer
  startCountdown(order.expired_at);

  // Polling status
  startPolling(order.order_id);
}

function startCountdown(expiredAt) {
  clearInterval(state.countdownTimer);
  const timerEl = document.getElementById('timer-display');
  const timerBox = document.getElementById('timer-box');

  function tick() {
    const diff = new Date(expiredAt) - Date.now();
    if (diff <= 0) {
      timerEl.textContent = '00:00';
      timerBox.style.background = 'rgba(239,68,68,.1)';
      clearInterval(state.countdownTimer);
      return;
    }
    const m = String(Math.floor(diff / 60000)).padStart(2, '0');
    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    timerEl.textContent = `${m}:${s}`;
  }
  tick();
  state.countdownTimer = setInterval(tick, 1000);
}

function startPolling(orderId) {
  clearInterval(state.pollTimer);
  let tries = 0;
  const MAX  = 60; // max 5 menit (5s interval)

  state.pollTimer = setInterval(async () => {
    tries++;
    if (tries > MAX) { clearInterval(state.pollTimer); return; }

    try {
      const res  = await fetch(`${CONFIG.API_BASE}/api/web/order/${orderId}?tenant_id=${CONFIG.TENANT_ID}`);
      const data = await res.json();

      if (data.status === 'paid' && data.delivered) {
        clearTimers();
        showOrderSuccess(data);
      } else if (data.status === 'expired' || data.status === 'failed') {
        clearTimers();
        showOrderFailed(data.status);
      }
    } catch (e) { /* retry */ }
  }, 5000);
}

function showOrderSuccess(order) {
  document.getElementById('payment-spinner').style.display = 'none';
  document.getElementById('payment-check').style.display   = 'block';
  document.getElementById('payment-status-title').textContent = '✅ Pembayaran Berhasil!';
  document.getElementById('payment-status-desc').textContent  = 'Produk sudah siap di bawah';
  document.getElementById('timer-box').style.display         = 'none';
  document.getElementById('payment-qris-section').style.display = 'none';
  document.getElementById('payment-url-section').style.display  = 'none';

  const successEl = document.getElementById('payment-success-content');
  successEl.style.display = 'block';

  document.getElementById('delivery-content-box').textContent = order.delivery_content || '';

  const terms = order.variant_terms || order.product_terms;
  const termsBox = document.getElementById('delivery-terms-box');
  if (terms) {
    termsBox.style.display = 'block';
    document.getElementById('delivery-terms-text').textContent = terms;
  } else {
    termsBox.style.display = 'none';
  }
}

function showOrderFailed(status) {
  document.getElementById('payment-status-title').textContent = status === 'expired' ? '⏰ Waktu Habis' : '❌ Pembayaran Gagal';
  document.getElementById('payment-status-desc').textContent  = 'Silakan buat pesanan baru';
  document.getElementById('payment-spinner').style.display = 'none';
  document.getElementById('payment-qris-section').style.display = 'none';
  document.getElementById('payment-url-section').style.display  = 'none';
}

function copyQRIS() {
  const code = document.getElementById('qris-code-text').textContent;
  navigator.clipboard.writeText(code).then(() => showToast('✅ Kode QRIS berhasil disalin!'));
}

function copyDelivery() {
  const txt = document.getElementById('delivery-content-box').textContent;
  navigator.clipboard.writeText(txt).then(() => showToast('✅ Produk berhasil disalin!'));
}

/* ─────────────────────────────────────────────
   TRACK ORDER MODAL
   ───────────────────────────────────────────── */
function showTrackModal() {
  document.getElementById('track-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('track-error').style.display  = 'none';
  document.getElementById('track-result').style.display = 'none';
  document.getElementById('track-order-id').value = '';
}

function closeTrackModal(e) {
  if (e && e.target !== document.getElementById('track-modal')) return;
  document.getElementById('track-modal').classList.remove('open');
  document.body.style.overflow = '';
}

async function trackOrder() {
  const id     = document.getElementById('track-order-id').value.trim();
  const errEl  = document.getElementById('track-error');
  const resEl  = document.getElementById('track-result');
  errEl.style.display  = 'none';
  resEl.style.display  = 'none';

  if (!id) { showErr(errEl, 'Masukkan ID pesanan'); return; }

  try {
    const res  = await fetch(`${CONFIG.API_BASE}/api/web/order/${id}?tenant_id=${CONFIG.TENANT_ID}`);
    const data = await res.json();

    if (!res.ok) { showErr(errEl, data.error || 'Pesanan tidak ditemukan'); return; }

    const statusLabels = {
      paid   : '✅ Lunas & Terkirim',
      pending: '⏳ Menunggu Pembayaran',
      expired: '⏰ Expired',
      failed : '❌ Gagal',
    };
    const statusClass = { paid: 'badge-paid', pending: 'badge-pending', expired: 'badge-expired', failed: 'badge-failed' };

    document.getElementById('track-status-badge').textContent  = statusLabels[data.status] || data.status;
    document.getElementById('track-status-badge').className    = `track-status-badge ${statusClass[data.status] || ''}`;

    const prodLabel = data.variant_name ? `${data.product_name} - ${data.variant_name}` : data.product_name;
    document.getElementById('track-details').innerHTML = `
      <div>📦 <strong>Produk:</strong> ${esc(prodLabel)}</div>
      <div>📧 <strong>Email:</strong> ${esc(data.buyer_email)}</div>
      <div>🛍 <strong>Qty:</strong> ${data.qty}</div>
      <div>💰 <strong>Total:</strong> ${fmtRp(data.amount)}</div>
      <div>📅 <strong>Tanggal:</strong> ${new Date(data.created_at).toLocaleString('id-ID')}</div>
    `;

    const delivBox  = document.getElementById('track-delivery-box');
    const copyBtn   = document.getElementById('track-copy-btn');
    const termsBox  = document.getElementById('track-terms-box');

    if (data.status === 'paid' && data.delivery_content) {
      delivBox.textContent   = data.delivery_content;
      delivBox.style.display = 'block';
      copyBtn.style.display  = 'block';

      const terms = data.variant_terms || data.product_terms;
      if (terms) {
        termsBox.style.display = 'block';
        document.getElementById('track-terms-text').textContent = terms;
      } else {
        termsBox.style.display = 'none';
      }
    } else {
      delivBox.style.display = 'none';
      copyBtn.style.display  = 'none';
      termsBox.style.display = 'none';
    }

    resEl.style.display = 'block';
  } catch (e) {
    showErr(errEl, 'Koneksi gagal, coba lagi');
  }
}

function copyTrackDelivery() {
  const txt = document.getElementById('track-delivery-box').textContent;
  navigator.clipboard.writeText(txt).then(() => showToast('✅ Produk berhasil disalin!'));
}

/* ─────────────────────────────────────────────
   HELPERS
   ───────────────────────────────────────────── */
function showStep(step) {
  ['detail','checkout','payment'].forEach(s => {
    document.getElementById(`step-${s}`).style.display = s === step ? 'block' : 'none';
  });
}

function clearTimers() {
  clearInterval(state.pollTimer);
  clearInterval(state.countdownTimer);
}

function fmtRp(n) {
  return 'Rp ' + Number(n).toLocaleString('id-ID');
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showErr(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
}

let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}
