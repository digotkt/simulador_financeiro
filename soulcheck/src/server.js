const express = require('express');
const config = require('./config');
const wa = require('./whatsapp');
const flow = require('./flow');
const payment = require('./payment');
const db = require('./db');

const app = express();

// Stripe webhook needs raw body
app.post(
  '/webhook/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const event = await payment.handleWebhookEvent(
        req.body,
        req.headers['stripe-signature']
      );

      if (event.type === 'checkout.session.completed') {
        const checkoutSession = event.data.object;
        const session = await db.completePayment(checkoutSession.id);
        if (session) {
          await flow.deliverFullReading(session);
        }
      }

      res.json({ received: true });
    } catch (err) {
      console.error('[Stripe Webhook] Error:', err.message);
      res.status(400).json({ error: err.message });
    }
  }
);

// All other routes use JSON body
app.use(express.json());

// Z-API webhook - incoming WhatsApp messages
app.post('/webhook/whatsapp', async (req, res) => {
  try {
    // Ignore messages sent by us
    if (wa.isFromMe(req.body)) {
      return res.json({ ok: true });
    }

    const phone = wa.extractPhone(req.body);
    const text = wa.extractMessageText(req.body);

    if (!phone || !text) {
      return res.json({ ok: true });
    }

    console.log(`[WhatsApp] ${phone}: ${text}`);

    // Process asynchronously so we don't block the webhook
    flow.handleMessage(phone, text).catch((err) => {
      console.error('[Flow] Async error:', err);
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[WhatsApp Webhook] Error:', err);
    res.json({ ok: true });
  }
});

// Payment success redirect page
app.get('/payment/success', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>SoulCheck - Pagamento Confirmado</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          display: flex; align-items: center; justify-content: center;
          min-height: 100vh; margin: 0;
          background: linear-gradient(135deg, #1a0533 0%, #0d001a 100%);
          color: white; text-align: center;
        }
        .container { padding: 2rem; max-width: 400px; }
        h1 { font-size: 2rem; margin-bottom: 0.5rem; }
        p { font-size: 1.1rem; opacity: 0.8; line-height: 1.6; }
        .emoji { font-size: 4rem; margin-bottom: 1rem; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="emoji">✨</div>
        <h1>Pagamento Confirmado!</h1>
        <p>Sua análise completa será enviada no WhatsApp em instantes. Volte para a conversa e aguarde.</p>
      </div>
    </body>
    </html>
  `);
});

// Payment cancel redirect
app.get('/payment/cancel', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>SoulCheck</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          display: flex; align-items: center; justify-content: center;
          min-height: 100vh; margin: 0;
          background: linear-gradient(135deg, #1a0533 0%, #0d001a 100%);
          color: white; text-align: center;
        }
        .container { padding: 2rem; max-width: 400px; }
        p { font-size: 1.1rem; opacity: 0.8; line-height: 1.6; }
      </style>
    </head>
    <body>
      <div class="container">
        <p>Sua análise ainda está disponível! Volte ao WhatsApp e digite <strong>desbloquear</strong> quando estiver pronto.</p>
      </div>
    </body>
    </html>
  `);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'soulcheck-mvp' });
});

app.listen(config.port, () => {
  console.log(`[SoulCheck] Server running on port ${config.port}`);
});
