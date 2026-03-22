const db = require('./db-memory');
const tg = require('./telegram');
const ai = require('./ai-claude');
const config = require('./config');

/*
  States:
  WELCOME        → user just started, bot sends intro
  ASK_TARGET     → waiting for target person's name
  ASK_USER_NAME  → waiting for user's name
  ASK_BIRTH      → waiting for birth date (optional)
  GENERATING     → AI is generating partial reading
  PAYWALL        → partial reading sent, waiting for payment
  COMPLETED      → full reading delivered
*/

const MESSAGES = {
  welcome: [
    '✨ *Bem-vindo(a) ao SoulCheck* ✨',
    'Eu consigo sentir conexões emocionais entre pessoas e revelar o que alguém está pensando sobre você neste exato momento.',
    'Vamos começar? Me diz: *qual o nome da pessoa que você quer descobrir se está pensando em você?*',
  ],
  askUserName: 'Agora me diz o *seu nome* para eu poder sintonizar a conexão entre vocês.',
  askBirth:
    'Se quiser uma leitura mais profunda, me envie sua *data de nascimento* (ex: 15/03/1995).\n\nOu digite *pular* para continuar sem essa informação.',
  generating: '🔮 Analisando a conexão energética entre vocês... aguarde um momento.',
  paywall: [
    '🔒 *A análise completa está pronta!*',
    'Para desbloquear a leitura completa com:\n\n✅ Análise detalhada da conexão\n✅ Probabilidade de interesse\n✅ Mensagem sugerida para enviar\n✅ Próximo passo recomendado\n\n💰 *Por apenas R$ 9,90*',
  ],
  paymentSuccess:
    '✅ *Pagamento confirmado!* Preparando sua análise completa... 🔮',
  completed:
    '\n\n---\n✨ Gostou da experiência? Envie /start para descobrir sobre outra pessoa!',
  error: 'Desculpe, algo deu errado. Por favor, tente novamente enviando qualquer mensagem.',
};

async function handleMessage(chatId, text) {
  try {
    let session = db.getActiveSession(chatId);

    if (
      !session ||
      text === '/start' ||
      text.toLowerCase().includes('nova análise')
    ) {
      return await startNewSession(chatId);
    }

    switch (session.state) {
      case 'WELCOME':
      case 'ASK_TARGET':
        return await handleTargetName(session, chatId, text);
      case 'ASK_USER_NAME':
        return await handleUserName(session, chatId, text);
      case 'ASK_BIRTH':
        return await handleBirthDate(session, chatId, text);
      case 'PAYWALL':
        return await handlePaywallResponse(session, chatId, text);
      case 'COMPLETED':
        return await startNewSession(chatId);
      default:
        return await tg.sendText(chatId, MESSAGES.error);
    }
  } catch (err) {
    console.error('[Flow] Error:', err);
    await tg.sendText(chatId, MESSAGES.error);
  }
}

async function handleCallbackQuery(chatId, data, callbackQueryId) {
  if (data.startsWith('pay_')) {
    const sessionId = data.replace('pay_', '');
    return await simulatePayment(chatId, sessionId);
  }
}

async function startNewSession(chatId) {
  db.createSession(chatId);
  await tg.sendWithDelay(chatId, MESSAGES.welcome);
  const session = db.getActiveSession(chatId);
  db.updateSession(session.id, { state: 'ASK_TARGET' });
}

async function handleTargetName(session, chatId, text) {
  const targetName = text.trim();
  if (targetName.length < 2 || targetName.startsWith('/')) {
    return await tg.sendText(
      chatId,
      'Por favor, me diga o *nome da pessoa* que você quer analisar.'
    );
  }
  db.updateSession(session.id, { target_name: targetName, state: 'ASK_USER_NAME' });
  await tg.sendText(chatId, `*${targetName}*... entendi. ${MESSAGES.askUserName}`);
}

async function handleUserName(session, chatId, text) {
  const userName = text.trim();
  if (userName.length < 2 || userName.startsWith('/')) {
    return await tg.sendText(chatId, 'Preciso do seu nome para continuar. Qual é o seu nome?');
  }
  db.updateSession(session.id, { user_name: userName, state: 'ASK_BIRTH' });
  await tg.sendText(chatId, `Prazer, *${userName}*! ${MESSAGES.askBirth}`);
}

async function handleBirthDate(session, chatId, text) {
  const input = text.trim().toLowerCase();
  const birthDate = input === 'pular' || input === 'skip' ? null : input;

  db.updateSession(session.id, {
    birth_date: birthDate,
    state: 'GENERATING',
  });

  await tg.sendText(chatId, MESSAGES.generating);

  // Generate partial reading with Claude
  const partialReading = await ai.generatePartialReading(
    session.user_name,
    session.target_name,
    birthDate
  );

  db.updateSession(session.id, {
    partial_response: partialReading,
    state: 'PAYWALL',
  });

  // Send partial reading
  await tg.sendText(chatId, partialReading);

  // Wait for impact
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Send paywall messages
  await tg.sendWithDelay(chatId, MESSAGES.paywall);

  // Send payment button (simulated)
  await tg.sendInlineKeyboard(
    chatId,
    '👇 Clique no botão abaixo para desbloquear (pagamento simulado para teste):',
    [
      [
        {
          text: '💳 Desbloquear Análise Completa - R$ 9,90',
          callback_data: `pay_${session.id}`,
        },
      ],
    ]
  );
}

async function handlePaywallResponse(session, chatId, text) {
  const lower = text.toLowerCase();
  if (
    lower === 'sim' ||
    lower === 'quero' ||
    lower === 'desbloquear' ||
    lower === 'pagar'
  ) {
    return await simulatePayment(chatId, session.id);
  }
  await tg.sendText(
    chatId,
    '🔮 Sua análise completa ainda está disponível! Digite *desbloquear* ou clique no botão acima.'
  );
}

async function simulatePayment(chatId, sessionId) {
  const session = db.getSessionById(sessionId);
  if (!session) {
    return await tg.sendText(chatId, MESSAGES.error);
  }

  // Simulate payment
  db.createPayment(sessionId, chatId, config.payment.amount, 'test', 'test_' + Date.now());
  const updatedSession = db.completePayment(sessionId);

  if (!updatedSession) {
    return await tg.sendText(chatId, MESSAGES.error);
  }

  await deliverFullReading(updatedSession);
}

async function deliverFullReading(session) {
  const chatId = session.chat_id;
  await tg.sendText(chatId, MESSAGES.paymentSuccess);

  const fullReading = await ai.generateFullReading(
    session.user_name,
    session.target_name,
    session.birth_date,
    session.partial_response
  );

  db.updateSession(session.id, {
    full_response: fullReading,
    state: 'COMPLETED',
  });

  await tg.sendText(chatId, fullReading);
  await tg.sendText(chatId, MESSAGES.completed);
}

module.exports = {
  handleMessage,
  handleCallbackQuery,
  deliverFullReading,
};
