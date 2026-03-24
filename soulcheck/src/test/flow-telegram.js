const db = require('./db-memory');
const tg = require('./telegram');
const ai = require('./ai-claude');
const config = require('./config');
const analytics = require('../analytics');
const kb = require('../knowledge-base');

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

// Pick random item from array
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Validates that text looks like a real name
function isValidName(text) {
  const cleaned = text.trim();
  if (cleaned.length < 2 || cleaned.length > 50) return false;
  if (/[\/\\@#$%^&*()=+\[\]{}<>|~`0-9]/.test(cleaned)) return false;
  if (/\b(cd|npm|node|sudo|rm|ls|cat|echo|install|run|test|http|www|start)\b/i.test(cleaned)) return false;
  return true;
}

// Check if user wants to skip birth date (flexible matching)
function wantsToSkip(text) {
  const lower = text.trim().toLowerCase();
  return /^(pular|pula|pulaa+|skip|skipar|nao|não|n|nah|bora|segue|vai|tanto faz|deixa|sem|passo)$/.test(lower);
}

// Check if user wants to pay/unlock
function wantsToPay(text) {
  const lower = text.trim().toLowerCase();
  return /^(sim|quero|bora|vai|desbloquear|pagar|manda|pode|claro|quero ver|libera|show|dale|partiu|vamo|vamos|s)$/.test(lower);
}

const MESSAGES = {
  welcome: [
    [
      'sinto que voce chegou aqui por um motivo...',
      '✨ SoulCheck ✨\n\ntem alguem ocupando seus pensamentos ne? eu consigo sentir. a energia que te trouxe ate aqui e forte, e tem a ver com uma pessoa especifica.',
      'me conta... qual o nome dessa pessoa que nao sai da sua cabeca?',
    ],
    [
      'oi... voce ta aqui porque ta sentindo algo, ne?',
      '✨ SoulCheck ✨\n\neu sei que tem alguem que voce nao consegue tirar do pensamento. essa energia e real e eu to sentindo daqui.',
      'me fala o nome dessa pessoa vai...',
    ],
    [
      'eii, que bom que voce veio...',
      '✨ SoulCheck ✨\n\nalgo me diz que voce ta pensando em alguem agora mesmo. e essa pessoa pode ta pensando em voce tambem, sabia?',
      'me diz o nome dela/dele que eu sinto a energia entre voces',
    ],
  ],
  askUserName: [
    'e voce? como eu te chamo? preciso do seu nome pra sentir a conexao entre voces',
    'agora me fala o seu nome... preciso dele pra me conectar com a energia de voces dois',
    'e qual o seu nome? preciso sentir quem voce e pra ler a conexao',
  ],
  askBirth: [
    'quase la... se quiser que eu va mais fundo, me passa sua data de nascimento (tipo 15/03/1995)\n\nse preferir, digita pular, mas a leitura fica mais forte com essa info 🌙',
    'uma ultima coisa... me manda sua data de nascimento (ex: 15/03/1995) que a leitura fica muito mais precisa\n\nou digita pular se quiser ir direto 🌙',
  ],
  generating: [
    '🔮 to me conectando com a energia entre voces dois...\n\nrespira fundo, pode levar uns segundos',
    '🔮 deixa eu sentir o que ta rolando entre voces...\n\nfica tranquilo, ja to captando',
    '🔮 a conexao ta se formando... consigo sentir algo forte aqui\n\num momento...',
  ],
  targetReaction: [
    '{name}... ja sinto algo.',
    '{name}... essa energia e forte.',
    '{name}... interessante, ja to sentindo algo entre voces.',
    '{name}... hm, tem coisa ai.',
  ],
  userReaction: [
    '{name}... a conexao entre voces dois ta ficando mais clara.',
    '{name}, entendi. consigo sentir sua energia agora.',
    '{name}... pronto, agora to conectada com voces dois.',
  ],
  paywall: [
    [
      'eu encontrei algo importante.',
      'a leitura revelou coisas que voce precisa saber. mas essa parte e delicada demais pra entregar de graca.\n\nna leitura completa voce descobre:\n\n🔮 o que essa pessoa realmente sente por voce\n💭 a probabilidade real de interesse\n💌 a mensagem certa pra mandar agora\n🚀 o proximo passo que pode mudar tudo\n\npor apenas R$ 9,90',
    ],
    [
      'tem algo aqui que voce precisa ver...',
      'eu vi coisas sobre o que essa pessoa sente, mas nao posso te contar tudo assim. a parte mais importante ta na leitura completa.\n\n🔮 os sentimentos reais\n💭 a chance de voces\n💌 o que falar pra essa pessoa\n🚀 o que fazer agora\n\nR$ 9,90 pra desbloquear tudo',
    ],
  ],
  paymentSuccess: [
    '✨ recebido. to canalizando a leitura completa agora... 🔮',
    '✨ pronto, vou te mandar tudo agora... 🔮',
  ],
  completed: [
    '\n\ntem mais alguem que voce quer descobrir? manda /start que eu sinto a energia ✨',
    '\n\nquer saber sobre outra pessoa? e so mandar /start ✨',
  ],
  error: [
    'as energias se desestabilizaram por um instante. me manda qualquer coisa que eu retomo',
    'ops, perdi a conexao por um segundo. manda uma mensagem que eu volto',
  ],
  invalidName: [
    'preciso de um nome de verdade pra sentir a energia. me diz o nome da pessoa 🌙',
    'hm, nao consegui captar. me manda so o nome, ta? 🌙',
  ],
};

async function handleMessage(chatId, text) {
  try {
    let session = db.getActiveSession(chatId);

    if (
      !session ||
      text === '/start' ||
      text.toLowerCase().includes('nova análise') ||
      text.toLowerCase().includes('nova analise')
    ) {
      return await startNewSession(chatId);
    }

    // Track user message with response time
    analytics.trackMessage(session.id, text, session.state);

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
        return await tg.sendText(chatId, pick(MESSAGES.error));
    }
  } catch (err) {
    console.error('[Flow] Error:', err);
    await tg.sendText(chatId, pick(MESSAGES.error));
  }
}

async function handleCallbackQuery(chatId, data, callbackQueryId) {
  if (data.startsWith('pay_')) {
    const sessionId = data.replace('pay_', '');
    return await simulatePayment(chatId, sessionId);
  }
}

async function startNewSession(chatId) {
  const session = db.createSession(chatId);
  analytics.track(session.id, 'session_start', { chatId });

  await tg.sendWithDelay(chatId, pick(MESSAGES.welcome));
  const activeSession = db.getActiveSession(chatId);
  db.updateSession(activeSession.id, { state: 'ASK_TARGET' });
}

async function handleTargetName(session, chatId, text) {
  const targetName = text.trim();
  if (!isValidName(targetName)) {
    return await tg.sendText(chatId, pick(MESSAGES.invalidName));
  }
  db.updateSession(session.id, { target_name: targetName, state: 'ASK_USER_NAME' });
  analytics.track(session.id, 'target_name_provided', { targetName });

  const reaction = pick(MESSAGES.targetReaction).replace('{name}', targetName);
  await tg.sendText(chatId, reaction);
  await tg.sendText(chatId, pick(MESSAGES.askUserName));
}

async function handleUserName(session, chatId, text) {
  const userName = text.trim();
  if (!isValidName(userName)) {
    return await tg.sendText(chatId, pick(MESSAGES.invalidName));
  }
  db.updateSession(session.id, { user_name: userName, state: 'ASK_BIRTH' });
  analytics.track(session.id, 'user_name_provided', { userName });

  const reaction = pick(MESSAGES.userReaction).replace('{name}', userName);
  await tg.sendText(chatId, reaction);
  await tg.sendText(chatId, pick(MESSAGES.askBirth));
}

async function handleBirthDate(session, chatId, text) {
  const birthDate = wantsToSkip(text) ? null : text.trim();

  db.updateSession(session.id, {
    birth_date: birthDate,
    state: 'GENERATING',
  });

  analytics.track(session.id, 'onboarding_complete', {
    hasBirthDate: !!birthDate,
    userName: session.user_name,
    targetName: session.target_name,
  });

  await tg.sendText(chatId, pick(MESSAGES.generating));

  // Build conversation context for AI
  const userMessages = analytics.getUserMessages(session.id);
  const conversationContext = { userMessages };

  // Generate partial reading with context
  const partialReading = await ai.generatePartialReading(
    session.user_name,
    session.target_name,
    birthDate,
    conversationContext
  );

  db.updateSession(session.id, {
    partial_response: partialReading,
    state: 'PAYWALL',
  });

  analytics.track(session.id, 'paywall_reached', {
    partialReadingLength: partialReading.length,
  });

  // Send partial reading
  await tg.sendText(chatId, partialReading);

  // Pause for emotional impact (3-5s)
  await new Promise((resolve) => setTimeout(resolve, 3000 + Math.random() * 2000));

  // Send paywall
  await tg.sendWithDelay(chatId, pick(MESSAGES.paywall));

  // Payment button
  await tg.sendInlineKeyboard(
    chatId,
    '👇 toque aqui pra desbloquear',
    [
      [
        {
          text: '🔓 ver leitura completa - R$ 9,90',
          callback_data: `pay_${session.id}`,
        },
      ],
    ]
  );
}

async function handlePaywallResponse(session, chatId, text) {
  if (wantsToPay(text)) {
    return await simulatePayment(chatId, session.id);
  }
  await tg.sendText(
    chatId,
    'a leitura ainda ta aqui, esperando por voce. quando quiser, e so tocar no botao acima 🔮'
  );
}

async function simulatePayment(chatId, sessionId) {
  const session = db.getSessionById(sessionId);
  if (!session) {
    return await tg.sendText(chatId, pick(MESSAGES.error));
  }

  db.createPayment(sessionId, chatId, config.payment.amount, 'test', 'test_' + Date.now());
  const updatedSession = db.completePayment(sessionId);

  if (!updatedSession) {
    return await tg.sendText(chatId, pick(MESSAGES.error));
  }

  analytics.track(sessionId, 'payment_completed', {
    amount: config.payment.amount,
    partialReading: updatedSession.partial_response,
  });

  await deliverFullReading(updatedSession);
}

async function deliverFullReading(session) {
  const chatId = session.chat_id;
  await tg.sendText(chatId, pick(MESSAGES.paymentSuccess));

  // Build conversation context for AI
  const userMessages = analytics.getUserMessages(session.id);
  const conversationContext = { userMessages };

  const fullReading = await ai.generateFullReading(
    session.user_name,
    session.target_name,
    session.birth_date,
    session.partial_response,
    conversationContext
  );

  db.updateSession(session.id, {
    full_response: fullReading,
    state: 'COMPLETED',
  });

  analytics.track(session.id, 'full_reading_delivered', {
    readingLength: fullReading.length,
  });

  await tg.sendText(chatId, fullReading);
  await tg.sendText(chatId, pick(MESSAGES.completed));
}

module.exports = {
  handleMessage,
  handleCallbackQuery,
  deliverFullReading,
};
