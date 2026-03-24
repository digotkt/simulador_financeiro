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

// Dashboard - métricas em tempo real
app.get('/dashboard', (req, res) => {
  const analytics = require('./analytics');
  const data = analytics.getDashboard();

  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>SoulCheck - Dashboard</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: linear-gradient(135deg, #1a0533 0%, #0d001a 100%);
          color: white; min-height: 100vh; padding: 2rem;
        }
        h1 { text-align: center; margin-bottom: 2rem; font-size: 1.8rem; }
        .grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem; max-width: 900px; margin: 0 auto 2rem;
        }
        .card {
          background: rgba(255,255,255,0.08); border-radius: 12px;
          padding: 1.2rem; text-align: center;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .card .value { font-size: 2rem; font-weight: bold; color: #a78bfa; }
        .card .label { font-size: 0.85rem; opacity: 0.7; margin-top: 0.3rem; }
        .section { max-width: 900px; margin: 0 auto 1.5rem; }
        .section h2 { font-size: 1.2rem; margin-bottom: 0.8rem; opacity: 0.9; }
        .events {
          background: rgba(255,255,255,0.05); border-radius: 8px;
          padding: 1rem; font-family: monospace; font-size: 0.8rem;
          max-height: 300px; overflow-y: auto; line-height: 1.6;
        }
        .bar { display: flex; align-items: center; margin: 0.3rem 0; }
        .bar-label { width: 120px; font-size: 0.85rem; }
        .bar-fill { height: 20px; background: #a78bfa; border-radius: 4px; min-width: 2px; }
        .bar-value { margin-left: 0.5rem; font-size: 0.8rem; opacity: 0.7; }
        .refresh { text-align: center; margin-top: 1rem; opacity: 0.5; font-size: 0.8rem; }
      </style>
      <meta http-equiv="refresh" content="30">
    </head>
    <body>
      <h1>SoulCheck Dashboard</h1>
      <div class="grid">
        <div class="card">
          <div class="value">${data.totalSessions}</div>
          <div class="label">Sessoes</div>
        </div>
        <div class="card">
          <div class="value">${data.onboardingRate}</div>
          <div class="label">Taxa Onboarding</div>
        </div>
        <div class="card">
          <div class="value">${data.reachedPaywall}</div>
          <div class="label">Chegaram no Paywall</div>
        </div>
        <div class="card">
          <div class="value">${data.converted}</div>
          <div class="label">Convertidos</div>
        </div>
        <div class="card">
          <div class="value">${data.conversionRate}</div>
          <div class="label">Taxa Conversao</div>
        </div>
        <div class="card">
          <div class="value">${data.totalRevenue}</div>
          <div class="label">Receita Total</div>
        </div>
      </div>

      ${Object.keys(data.dropoffByState).length > 0 ? `
      <div class="section">
        <h2>Desistencias por Etapa</h2>
        ${Object.entries(data.dropoffByState).map(([state, count]) => {
          const max = Math.max(...Object.values(data.dropoffByState));
          const width = Math.round((count / max) * 100);
          return `<div class="bar">
            <span class="bar-label">${state}</span>
            <div class="bar-fill" style="width: ${width}%"></div>
            <span class="bar-value">${count}</span>
          </div>`;
        }).join('')}
      </div>` : ''}

      <div class="section">
        <h2>Eventos Recentes</h2>
        <div class="events">
          ${data.recentEvents.length > 0
            ? data.recentEvents.map(e => `<div>${e}</div>`).join('')
            : '<div style="opacity:0.5">Nenhum evento ainda...</div>'}
        </div>
      </div>

      <div class="refresh">Atualiza automaticamente a cada 30s</div>
    </body>
    </html>
  `);
});

// Dashboard API (JSON)
app.get('/api/dashboard', (req, res) => {
  const analytics = require('./analytics');
  res.json(analytics.getDashboard());
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'soulcheck-mvp' });
});

// Start server only when running directly (not on Vercel)
if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`[SoulCheck] Server running on port ${config.port}`);
  });
}

module.exports = app;
