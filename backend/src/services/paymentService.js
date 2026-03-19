const axios  = require('axios');
const crypto = require('crypto');

const TRIPAY_SANDBOX_URL    = 'https://tripay.co.id/api-sandbox';
const TRIPAY_PRODUCTION_URL = 'https://tripay.co.id/api';
const PAKASIR_URL           = 'https://app.pakasir.com/api';

/**
 * Buat transaksi Tripay
 */
async function createTripayPayment(config, { orderId, amount, productName, customerName }) {
  const { api_key, private_key, merchant_code, mode } = config;
  const BASE_URL  = mode === 'production' ? TRIPAY_PRODUCTION_URL : TRIPAY_SANDBOX_URL;
  const amountInt = parseInt(amount);

  const signature = crypto
    .createHmac('sha256', private_key)
    .update(`${merchant_code}${orderId}${amountInt}`)
    .digest('hex');

  const payload = {
    method        : 'QRIS2',
    merchant_ref  : orderId,
    amount        : amountInt,
    customer_name : customerName.substring(0, 50),
    customer_email: 'customer@example.com',
    customer_phone: '081234567890',
    order_items   : [{ sku: orderId, name: productName.substring(0, 50), price: amountInt, quantity: 1 }],
    expired_time  : Math.floor(Date.now() / 1000) + (2 * 60 * 60),
    signature,
  };

  const response = await axios.post(`${BASE_URL}/transaction/create`, payload, {
    headers: { Authorization: `Bearer ${api_key}`, 'Content-Type': 'application/json' }
  });

  if (!response.data.success) throw new Error(response.data.message || 'Tripay error');
  return { payment_url: response.data.data.checkout_url, gateway: 'tripay' };
}

/**
 * Buat transaksi Pakasir (QRIS)
 * Response berisi payment_number (string QRIS) + expired_at
 */
async function createPakasirPayment(config, { orderId, amount }) {
  const { api_key, project_slug } = config;
  const amountInt = parseInt(amount);

  const payload = {
    project : project_slug,
    order_id: orderId,
    amount  : amountInt,
    api_key,
  };

  console.log('Pakasir createPayment payload:', JSON.stringify(payload));

  const response = await axios.post(
    `${PAKASIR_URL}/transactioncreate/qris`,
    payload,
    { headers: { 'Content-Type': 'application/json' } }
  );

  console.log('Pakasir createPayment response:', JSON.stringify(response.data));

  if (!response.data?.payment) {
    throw new Error('Pakasir: gagal buat transaksi - ' + JSON.stringify(response.data));
  }

  const { payment_number, total_payment, expired_at } = response.data.payment;

  return {
    payment_url   : null,      // Pakasir tidak punya checkout URL
    payment_number,            // string QRIS — dikirim ke user untuk di-paste
    total_payment,
    expired_at,
    gateway       : 'pakasir',
  };
}

/**
 * Cek status transaksi Pakasir
 */
async function checkPakasirPayment(config, { orderId }) {
  const { api_key, project_slug } = config;

  const payload = {
    project : project_slug,
    order_id: orderId,
    api_key,
  };

  console.log('Pakasir checkPayment payload:', JSON.stringify(payload));

  const response = await axios.post(
    `${PAKASIR_URL}/transactioncheck`,
    payload,
    { headers: { 'Content-Type': 'application/json' } }
  );

  console.log('Pakasir checkPayment response:', JSON.stringify(response.data));

  return response.data;
}

/**
 * Entry point — pilih gateway berdasarkan config tenant
 */
async function createPayment(config, orderData) {
  if (config.gateway === 'pakasir') {
    return createPakasirPayment(config, orderData);
  }
  return createTripayPayment(config, orderData);
}

module.exports = { createPayment, createTripayPayment, createPakasirPayment, checkPakasirPayment };