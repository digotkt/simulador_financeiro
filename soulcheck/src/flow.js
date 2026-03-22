const db = require('./db');
const wa = require('./whatsapp');
const ai = require('./ai');
const payment = require('./payment');
const config = require('./config');

/*
  States:
  WELCOME        → user just started, bot sends intro
  ASK_TARGET     → waiting for target person's name
  ASK_USER_NAME  → waiting for user's name
  ASK_BIRTH      → waiting for birth date (optional)
  GENERATING     → AI is generating partial reading
  PAYWALL        → partial reading sent, waiting for payment
  PAID           → payment confirmed, delivering full reading
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
    '\n\n---\n✨ Gostou da experiência? Envie *nova análise* para descobrir sobre outra pessoa!',
  error: 'Desculpe, algo deu errado. Por favor, tente novamente enviando qualquer mensagem.',
};

async function handleMessage(phone, text) {
  try {
    let session = await db.getActiveSession(phone);

    if (!session || text.toLowerCase().includes('nova análise') || text.toLowerCase() === 'iniciar') {
      return await startNewSession(phone);
    }

    switch (session.state) {
      case 'WELCOME':
      case 'ASK_TARGET':
        return await handleTargetName(session, phone, text);
      case 'ASK_USER_NAME':
        return await handleUserName(session, phone, text);
      case 'ASK_BIRTH':
        return await handleBirthDate(session, phone, text);
      case 'PAYWALL':
        return await handlePaywallResponse(session, phone, text);
      case 'COMPLETED':
        return await startNewSession(phone);
      default:
        return await wa.sendText(phone, MESSAGES.error);
    }
  } catch (err) {
    console.error('[Flow] Error:', err);
    await wa.sendText(phone, MESSAGES.error);
  }
}

async function startNewSession(phone) {
  await db.createSession(phone);
  await wa.sendWithDelay(phone, MESSAGES.welcome);
  const session = await db.getActiveSession(phone);
  await db.updateSession(session.id, { state: 'ASK_TARGET' });
}

async function handleTargetName(session, phone, text) {
  const targetName = text.trim();
  if (targetName.length < 2) {
    return await wa.sendText(phone, 'Por favor, me diga o *nome da pessoa* que você quer analisar.');
  }
  await db.updateSession(session.id, { target_name: targetName, state: 'ASK_USER_NAME' });
  await wa.sendText(phone, `*${targetName}*... entendi. ${MESSAGES.askUserName}`);
}

async function handleUserName(session, phone, text) {
  const userName = text.trim();
  if (userName.length < 2) {
    return await wa.sendText(phone, 'Preciso do seu nome para continuar. Qual é o seu nome?');
  }
  await db.updateSession(session.id, { user_name: userName, state: 'ASK_BIRTH' });
  await wa.sendText(phone, `Prazer, *${userName}*! ${MESSAGES.askBirth}`);
}

async function handleBirthDate(session, phone, text) {
  const input = text.trim().toLowerCase();
  const birthDate = input === 'pular' || input === 'skip' ? null : input;

  await db.updateSession(session.id, {
    birth_date: birthDate,
    state: 'GENERATING',
  });

  await wa.sendText(phone, MESSAGES.generating);

  // Generate partial reading
  const partialReading = await ai.generatePartialReading(
    session.user_name,
    session.target_name,
    birthDate
  );

  await db.updateSession(session.id, {
    partial_response: partialReading,
    state: 'PAYWALL',
  });

  // Send partial reading
  await wa.sendText(phone, partialReading);

  // Wait a bit for impact
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Send paywall messages
  await wa.sendWithDelay(phone, MESSAGES.paywall);

  // Create payment link
  const checkout = await payment.createCheckoutSession(session.id, phone);

  await db.createPayment(
    session.id,
    phone,
    config.payment.amount,
    'stripe',
    checkout.id
  );

  await wa.sendText(
    phone,
    `🔗 *Clique aqui para desbloquear:*\n${checkout.url}`
  );
}

async function handlePaywallResponse(session, phone, text) {
  const lower = text.toLowerCase();
  if (lower === 'sim' || lower === 'quero' || lower === 'desbloquear') {
    const checkout = await payment.createCheckoutSession(session.id, phone);
    await db.createPayment(
      session.id,
      phone,
      config.payment.amount,
      'stripe',
      checkout.id
    );
    await wa.sendText(
      phone,
      `🔗 *Clique aqui para desbloquear sua análise:*\n${checkout.url}`
    );
  } else {
    await wa.sendText(
      phone,
      '🔮 Sua análise completa ainda está disponível! Quando quiser, é só digitar *desbloquear* ou clicar no link acima.'
    );
  }
}

async function deliverFullReading(session) {
  const phone = session.phone;
  await wa.sendText(phone, MESSAGES.paymentSuccess);

  const fullReading = await ai.generateFullReading(
    session.user_name,
    session.target_name,
    session.birth_date,
    session.partial_response
  );

  await db.updateSession(session.id, {
    full_response: fullReading,
    state: 'COMPLETED',
  });

  await wa.sendText(phone, fullReading);
  await wa.sendText(phone, MESSAGES.completed);
}

module.exports = {
  handleMessage,
  deliverFullReading,
};
