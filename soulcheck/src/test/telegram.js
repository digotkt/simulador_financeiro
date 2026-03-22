const axios = require('axios');
const config = require('./config');

const api = axios.create({
  baseURL: `https://api.telegram.org/bot${config.telegram.token}`,
  headers: { 'Content-Type': 'application/json' },
});

async function sendText(chatId, message) {
  try {
    await api.post('/sendMessage', {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
    });
  } catch (err) {
    // Markdown can fail with some characters, retry without parse_mode
    try {
      await api.post('/sendMessage', {
        chat_id: chatId,
        text: message,
      });
    } catch (retryErr) {
      console.error(`[Telegram] Erro ao enviar para ${chatId}:`, retryErr.message);
    }
  }
}

async function sendWithDelay(chatId, messages, delayMs = 1000) {
  for (const msg of messages) {
    await sendText(chatId, msg);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function sendInlineKeyboard(chatId, text, buttons) {
  try {
    await api.post('/sendMessage', {
      chat_id: chatId,
      text,
      reply_markup: {
        inline_keyboard: buttons,
      },
    });
  } catch (err) {
    console.error(`[Telegram] Erro ao enviar keyboard para ${chatId}:`, err.message);
  }
}

async function setWebhook(url) {
  const res = await api.post('/setWebhook', { url });
  return res.data;
}

async function deleteWebhook() {
  const res = await api.post('/deleteWebhook');
  return res.data;
}

async function getMe() {
  const res = await api.get('/getMe');
  return res.data;
}

module.exports = {
  sendText,
  sendWithDelay,
  sendInlineKeyboard,
  setWebhook,
  deleteWebhook,
  getMe,
};
