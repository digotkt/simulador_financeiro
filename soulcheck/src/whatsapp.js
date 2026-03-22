const axios = require('axios');
const config = require('./config');

const api = axios.create({
  baseURL: `${config.zapi.baseUrl}/${config.zapi.instanceId}/token/${config.zapi.token}`,
  headers: { 'Content-Type': 'application/json' },
});

async function sendText(phone, message) {
  try {
    await api.post('/send-text', {
      phone,
      message,
    });
  } catch (err) {
    console.error(`[WhatsApp] Erro ao enviar mensagem para ${phone}:`, err.message);
  }
}

async function sendWithDelay(phone, messages, delayMs = 1500) {
  for (const msg of messages) {
    await sendText(phone, msg);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

function extractMessageText(body) {
  if (body.text && body.text.message) return body.text.message;
  if (body.message) return body.message;
  return '';
}

function extractPhone(body) {
  if (body.phone) return body.phone;
  if (body.from) return body.from.replace('@c.us', '');
  return '';
}

function isFromMe(body) {
  return body.fromMe === true;
}

module.exports = {
  sendText,
  sendWithDelay,
  extractMessageText,
  extractPhone,
  isFromMe,
};
