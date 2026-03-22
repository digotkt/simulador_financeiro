const Stripe = require('stripe');
const config = require('./config');

const stripe = new Stripe(config.stripe.secretKey);

async function createCheckoutSession(sessionId, phone) {
  const checkoutSession = await stripe.checkout.sessions.create({
    payment_method_types: ['card', 'boleto'],
    line_items: [
      {
        price_data: {
          currency: config.payment.currency,
          product_data: {
            name: 'SoulCheck - Análise Completa',
            description: 'Análise detalhada de conexão emocional + mensagem sugerida',
          },
          unit_amount: config.payment.amount,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${config.baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.baseUrl}/payment/cancel?session_id={CHECKOUT_SESSION_ID}`,
    metadata: {
      soulcheck_session_id: sessionId,
      phone,
    },
  });

  return checkoutSession;
}

async function handleWebhookEvent(payload, signature) {
  const event = stripe.webhooks.constructEvent(
    payload,
    signature,
    config.stripe.webhookSecret
  );
  return event;
}

module.exports = {
  createCheckoutSession,
  handleWebhookEvent,
};
