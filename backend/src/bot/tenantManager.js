const { Telegraf } = require('telegraf');
const { pool } = require('../db/pool');

// Map of tenantId -> bot instance
const bots = new Map();

/**
 * Load semua tenant aktif dan jalankan botnya
 */
async function loadAllTenants() {
  const { rows } = await pool.query(
    `SELECT * FROM tenants WHERE status = 'active'`
  );
  for (const tenant of rows) {
    await startTenantBot(tenant);
  }
  console.log(`✅ Loaded ${rows.length} tenant bot(s)`);
}

/**
 * Start bot untuk satu tenant
 */
async function startTenantBot(tenant) {
  if (bots.has(tenant.id)) {
    console.log(`Bot tenant #${tenant.id} sudah jalan`);
    return;
  }

  try {
    const bot = new Telegraf(tenant.bot_token);

    // Register semua handler dengan tenant context
    const registerHandlers = require('./botHandlers');
    registerHandlers(bot, tenant);

    // Launch bot
    bot.launch();
    bots.set(tenant.id, bot);
    console.log(`🤖 Bot tenant #${tenant.id} (${tenant.name}) started`);
  } catch (err) {
    console.error(`❌ Failed to start bot tenant #${tenant.id}:`, err.message);
  }
}

/**
 * Stop bot untuk satu tenant
 */
async function stopTenantBot(tenantId) {
  const bot = bots.get(tenantId);
  if (bot) {
    bot.stop();
    bots.delete(tenantId);
    console.log(`🛑 Bot tenant #${tenantId} stopped`);
  }
}

/**
 * Restart bot tenant (setelah update token dll)
 */
async function restartTenantBot(tenantId) {
  await stopTenantBot(tenantId);
  const { rows: [tenant] } = await pool.query(
    'SELECT * FROM tenants WHERE id = $1', [tenantId]
  );
  if (tenant && tenant.status === 'active') {
    await startTenantBot(tenant);
  }
}

/**
 * Get bot instance by tenantId
 */
function getBotByTenantId(tenantId) {
  return bots.get(tenantId);
}

/**
 * Graceful shutdown semua bot
 */
function stopAllBots() {
  for (const [tenantId, bot] of bots) {
    bot.stop();
    console.log(`🛑 Bot tenant #${tenantId} stopped`);
  }
  bots.clear();
}

module.exports = {
  loadAllTenants,
  startTenantBot,
  stopTenantBot,
  restartTenantBot,
  getBotByTenantId,
  stopAllBots,
};