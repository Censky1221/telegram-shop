require('dotenv').config();
const express = require('express');
const cors = require('cors');

const bot = require('./bot');
const productsRouter  = require('./api/routes/products');
const ordersRouter    = require('./api/routes/orders');
const webhookRouter   = require('./api/routes/webhook');
const adminRouter     = require('./api/routes/admin');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──────────────────────────────────────────
app.use(cors());

// Webhook Tripay harus SEBELUM express.json()
// karena butuh raw body untuk verifikasi signature
app.use('/api/webhook', webhookRouter);

// JSON parser untuk route lainnya
app.use(express.json());

// ── Routes ─────────────────────────────────────────────
app.use('/api/products', productsRouter);
app.use('/api/orders',   ordersRouter);
app.use('/api/admin',    adminRouter);

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date() }));

// ── Start ───────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});

// Launch Telegram bot (long polling for dev, webhook for prod)
bot.launch();
console.log('Telegram bot started');

// Graceful shutdown
process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));