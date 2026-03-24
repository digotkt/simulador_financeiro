const axios = require('axios');
const HttpsProxyAgent = require('https-proxy-agent');
const config = require('./config');

const httpsAgent = process.env.HTTPS_PROXY
  ? new HttpsProxyAgent(process.env.HTTPS_PROXY)
  : undefined;

const api = axios.create({
  baseURL: `https://api.telegram.org/bot${config.telegram.token}`,
  headers: { 'Content-Type': 'application/json' },
  proxy: false,
  httpsAgent,
});

async function sendTyping(chatId) {
  try {
    await api.post('/sendChatAction', { chat_id: chatId, action: 'typing' });
  } catch (err) {
    // non-critical, ignore
  }
}

// Simulates human typing speed: ~40-60 chars/sec + random jitter
function typingDelay(text) {
  const baseMs = Math.min(text.length * 25, 4000); // cap at 4s
  const jitter = Math.random() * 800 + 400; // 400-1200ms random
  return baseMs + jitter;
}

async function sendText(chatId, message) {
  // Show typing indicator + wait proportional to message length
  await sendTyping(chatId);
  await new Promise((resolve) => setTimeout(resolve, typingDelay(message)));

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

async function sendWithDelay(chatId, messages) {
  for (const msg of messages) {
    await sendText(chatId, msg);
    // Extra pause between sequential messages (1.5-3s)
    await new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 1500));
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
