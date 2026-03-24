require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',

  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },

  payment: {
    amount: 990,
    currency: 'brl',
  },
};
