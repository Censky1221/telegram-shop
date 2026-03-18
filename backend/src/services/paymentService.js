const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const TRIPAY_API_KEY     = process.env.TRIPAY_API_KEY;
const TRIPAY_PRIVATE_KEY = process.env.TRIPAY_PRIVATE_KEY;
const TRIPAY_MERCHANT    = process.env.TRIPAY_MERCHANT_CODE;
const IS_SANDBOX         = process.env.TRIPAY_MODE !== 'production';

const BASE_URL = IS_SANDBOX
  ? 'https://tripay.co.id/api-sandbox'
  : 'https://tripay.co.id/api';

async function createPayment({ orderId, amount, productName, customerName }) {
  const amountInt = parseInt(amount);

  // Signature: HMAC-SHA256(merchantCode + merchantRef + amount, privateKey)
  const signature = crypto
    .createHmac('sha256', TRIPAY_PRIVATE_KEY)
    .update(`${TRIPAY_MERCHANT}${orderId}${amountInt}`)
    .digest('hex');

  const expiredTime = Math.floor(Date.now() / 1000) + (2 * 60 * 60);

  const payload = {
    method         : 'QRIS2',
    merchant_ref   : orderId,
    amount         : amountInt,
    customer_name  : customerName.substring(0, 50),
    customer_email : 'customer@example.com',
    customer_phone : '081234567890',
    order_items    : [
      {
        sku      : orderId,
        name     : productName.substring(0, 50),
        price    : amountInt,
        quantity : 1,
      },
    ],
    expired_time : expiredTime,
    signature    : signature,
  };

  console.log('Tripay signature input:', `${TRIPAY_MERCHANT}${orderId}${amountInt}`);
  console.log('Tripay signature:', signature);

  try {
    const response = await axios.post(
      `${BASE_URL}/transaction/create`,
      payload,
      {
        headers: {
          Authorization : `Bearer ${TRIPAY_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.data.success) {
      console.error('Tripay error response:', response.data);
      throw new Error(response.data.message || 'Tripay payment creation failed');
    }

    return response.data.data.checkout_url;
  } catch (err) {
    if (err.response) {
      console.error('Tripay API error:', err.response.data);
    }
    throw err;
  }
}

module.exports = { createPayment };