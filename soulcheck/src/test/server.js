const express = require('express');
const config = require('./config');
const tg = require('./telegram');
const flow = require('./flow-telegram');
const db = require('./db-memory');

const app = express();
app.use(express.json());

// Telegram webhook - incoming messages
app.post('/webhook/telegram', async (req, res) => {
  try {
    const update = req.body;

    // Handle callback queries (inline button presses)
    if (update.callback_query) {
      const chatId = update.callback_query.message.chat.id;
      const data = update.callback_query.data;
      console.log(`[Telegram] Callback from ${chatId}: ${data}`);

      flow
        .handleCallbackQuery(chatId, data, update.callback_query.id)
        .catch((err) => console.error('[Flow] Callback error:', err));

      return res.json({ ok: true });
    }

    // Handle text messages
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text;
      console.log(`[Telegram] ${chatId}: ${text}`);

      flow
        .handleMessage(chatId, text)
        .catch((err) => console.error('[Flow] Message error:', err));
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[Telegram Webhook] Error:', err);
    res.json({ ok: true });
  }
});

// Debug endpoint - view in-memory data
app.get('/debug', (req, res) => {
  res.json(db.debugDump());
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'soulcheck-test', mode: 'telegram+claude' });
});

// Setup webhook helper
app.get('/setup', async (req, res) => {
  const webhookUrl = `${config.baseUrl}/webhook/telegram`;
  try {
    const result = await tg.setWebhook(webhookUrl);
    const me = await tg.getMe();
    res.json({
      webhook: result,
      bot: me.result,
      webhookUrl,
      message: `Bot @${me.result.username} configurado! Webhook: ${webhookUrl}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Polling mode (alternative to webhook, useful for local dev)
let pollingActive = false;
let pollingOffset = 0;

async function pollUpdates() {
  if (!config.telegram.token) {
    console.error('[Polling] TELEGRAM_BOT_TOKEN not set!');
    return;
  }

  pollingActive = true;
  console.log('[Polling] Starting Telegram polling mode...');

  const axios = require('axios');
  const baseUrl = `https://api.telegram.org/bot${config.telegram.token}`;

  while (pollingActive) {
    try {
      const res = await axios.get(`${baseUrl}/getUpdates`, {
        params: { offset: pollingOffset, timeout: 30 },
        timeout: 35000,
        proxy: false,
      });

      const updates = res.data.result || [];
      for (const update of updates) {
        pollingOffset = update.update_id + 1;

        if (update.callback_query) {
          const chatId = update.callback_query.message.chat.id;
          const data = update.callback_query.data;
          console.log(`[Polling] Callback from ${chatId}: ${data}`);
          flow
            .handleCallbackQuery(chatId, data, update.callback_query.id)
            .catch((err) => console.error('[Flow] Callback error:', err));
        } else if (update.message && update.message.text) {
          const chatId = update.message.chat.id;
          const text = update.message.text;
          console.log(`[Polling] ${chatId}: ${text}`);
          flow
            .handleMessage(chatId, text)
            .catch((err) => console.error('[Flow] Message error:', err));
        }
      }
    } catch (err) {
      if (err.code !== 'ECONNABORTED') {
        console.error('[Polling] Error:', err.message);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

// Start server
app.listen(config.port, async () => {
  console.log(`[SoulCheck Test] Server on port ${config.port}`);
  console.log(`[SoulCheck Test] Mode: Telegram + Claude (Anthropic)`);
  console.log(`[SoulCheck Test] Payment: Simulated (click button to "pay")`);
  console.log(`[SoulCheck Test] Database: In-memory`);
  console.log('');

  // If no BASE_URL set (local dev), use polling instead of webhook
  if (!process.env.BASE_URL || process.env.BASE_URL.includes('localhost')) {
    // Delete any existing webhook first
    try {
      await tg.deleteWebhook();
    } catch (_) {}
    pollUpdates();
  } else {
    // Production: set webhook
    try {
      const webhookUrl = `${config.baseUrl}/webhook/telegram`;
      await tg.setWebhook(webhookUrl);
      console.log(`[Webhook] Set to ${webhookUrl}`);
    } catch (err) {
      console.error('[Webhook] Failed to set:', err.message);
      console.log('[Webhook] Falling back to polling...');
      try {
        await tg.deleteWebhook();
      } catch (_) {}
      pollUpdates();
    }
  }
});

// Cleanup
process.on('SIGINT', () => {
  pollingActive = false;
  process.exit(0);
});
