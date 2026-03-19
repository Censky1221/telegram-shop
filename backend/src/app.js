require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const { loadAllTenants, stopAllBots } = require('./bot/tenantManager');
const productsRouter = require('./api/routes/products');
const ordersRouter   = require('./api/routes/orders');
const webhookRouter  = require('./api/routes/webhook');
const adminRouter    = require('./api/routes/admin');
const tenantRouter   = require('./api/routes/tenant');
const superRouter    = require('./api/routes/super');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use('/api/webhook', webhookRouter);
app.use(express.json());

// ── Routes ──────────────────────────────────────────────────
app.use('/api/products', productsRouter);
app.use('/api/orders',   ordersRouter);
app.use('/api/admin',    adminRouter);
app.use('/api/tenant',   tenantRouter);
app.use('/api/super',    superRouter);

app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date() }));

// ── Start ───────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`API running on http://localhost:${PORT}`);
  await loadAllTenants();
});

process.once('SIGINT',  () => { stopAllBots(); process.exit(0); });
process.once('SIGTERM', () => { stopAllBots(); process.exit(0); });