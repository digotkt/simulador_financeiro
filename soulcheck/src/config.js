require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',

  zapi: {
    instanceId: process.env.ZAPI_INSTANCE_ID,
    token: process.env.ZAPI_TOKEN,
    baseUrl: process.env.ZAPI_BASE_URL || 'https://api.z-api.io/instances',
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    priceAnalysis: process.env.STRIPE_PRICE_ANALYSIS,
  },

  payment: {
    amount: parseInt(process.env.PAYMENT_AMOUNT || '990', 10),
    currency: process.env.PAYMENT_CURRENCY || 'brl',
  },

  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
  },
};
