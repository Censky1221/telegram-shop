const bot = require('../bot');

/**
 * Send a plain text message to a Telegram user
 */
async function sendMessage(telegramId, text, options = {}) {
  return bot.telegram.sendMessage(telegramId, text, options);
}

/**
 * Send a Markdown message to a Telegram user
 */
async function sendMarkdown(telegramId, text) {
  return bot.telegram.sendMessage(telegramId, text, { parse_mode: 'Markdown' });
}

module.exports = { sendMessage, sendMarkdown };
