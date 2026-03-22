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

// Validates that text looks like a real name (letters, spaces, hyphens only)
function isValidName(text) {
  const cleaned = text.trim();
  if (cleaned.length < 2 || cleaned.length > 50) return false;
  if (/[\/\\@#$%^&*()=+\[\]{}<>|~`0-9]/.test(cleaned)) return false;
  if (/\b(cd|npm|node|sudo|rm|ls|cat|echo|install|run|test|http|www|start)\b/i.test(cleaned)) return false;
  return true;
}

const MESSAGES = {
  welcome: [
    'Sinto que você chegou aqui por um motivo...',
    '✨ *SoulCheck* ✨\n\nExiste alguém ocupando seus pensamentos, não é? Eu consigo sentir. A energia que te trouxe até aqui é forte — e tem a ver com uma pessoa específica.',
    'Me conta... *qual o nome dessa pessoa que não sai da sua cabeça?*',
  ],
  askUserName: 'E você? *Como eu te chamo?* Preciso do seu nome pra sentir a conexão entre vocês.',
  askBirth:
    'Quase lá... Se quiser que eu vá mais fundo, me passa sua *data de nascimento* (ex: 15/03/1995).\n\nSe preferir, digita *pular* — mas a leitura fica mais poderosa com essa informação. 🌙',
  generating: '🔮 Estou me conectando com a energia entre vocês dois...\n\n_Isso pode levar alguns segundos. Respire fundo._',
  paywall: [
    '⚡ *Eu encontrei algo importante.*',
    'A análise revelou coisas que você precisa saber. Mas essa parte é delicada demais pra entregar de graça.\n\nNa leitura completa você descobre:\n\n🔮 O que essa pessoa *realmente* sente por você\n💭 A probabilidade real de interesse\n💌 A mensagem certa pra mandar agora\n🚀 O próximo passo que pode mudar tudo\n\n*Desbloqueie por apenas R$ 9,90*',
  ],
  paymentSuccess:
    '✨ *Recebido.* Estou canalizando a leitura completa agora... 🔮',
  completed:
    '\n\n---\n✨ Tem mais alguém que você quer descobrir? Envie /start e eu sinto a energia.',
  error: 'As energias se desestabilizaram por um instante. Me manda qualquer mensagem que eu retomo a conexão.',
  invalidName: 'Preciso de um *nome de verdade* pra sentir a energia. Me diz o nome da pessoa. 🌙',
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
  if (!isValidName(targetName)) {
    return await tg.sendText(chatId, MESSAGES.invalidName);
  }
  db.updateSession(session.id, { target_name: targetName, state: 'ASK_USER_NAME' });
  await tg.sendText(chatId, `*${targetName}*... já sinto algo. ${MESSAGES.askUserName}`);
}

async function handleUserName(session, chatId, text) {
  const userName = text.trim();
  if (!isValidName(userName)) {
    return await tg.sendText(chatId, MESSAGES.invalidName);
  }
  db.updateSession(session.id, { user_name: userName, state: 'ASK_BIRTH' });
  await tg.sendText(chatId, `*${userName}*... a conexão entre vocês dois está ficando mais clara. ${MESSAGES.askBirth}`);
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
    '👇 Toque aqui pra desbloquear a revelação completa:',
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
    '🔮 A leitura ainda está aqui, esperando por você. A energia não mente — quando quiser, é só digitar *desbloquear*.'
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
