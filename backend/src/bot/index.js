const { Telegraf } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

// Register commands and actions
require('./commands/start')(bot);
require('./commands/products')(bot);
require('./commands/orders')(bot);
require('./actions/buy')(bot);

module.exports = bot;
