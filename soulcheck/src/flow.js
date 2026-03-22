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

// Validates that text looks like a real name (letters, spaces, hyphens only)
function isValidName(text) {
  const cleaned = text.trim();
  if (cleaned.length < 2 || cleaned.length > 50) return false;
  if (/[\/\\@#$%^&*()=+\[\]{}<>|~`0-9]/.test(cleaned)) return false;
  if (/\b(cd|npm|node|sudo|rm|ls|cat|echo|install|run|test|http|www)\b/i.test(cleaned)) return false;
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
    '\n\n---\n✨ Tem mais alguém que você quer descobrir? Envie *nova análise* e eu sinto a energia.',
  error: 'As energias se desestabilizaram por um instante. Me manda qualquer mensagem que eu retomo a conexão.',
  invalidName: 'Preciso de um *nome de verdade* pra sentir a energia. Me diz o nome da pessoa. 🌙',
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
  if (!isValidName(targetName)) {
    return await wa.sendText(phone, MESSAGES.invalidName);
  }
  await db.updateSession(session.id, { target_name: targetName, state: 'ASK_USER_NAME' });
  await wa.sendText(phone, `*${targetName}*... já sinto algo. ${MESSAGES.askUserName}`);
}

async function handleUserName(session, phone, text) {
  const userName = text.trim();
  if (!isValidName(userName)) {
    return await wa.sendText(phone, MESSAGES.invalidName);
  }
  await db.updateSession(session.id, { user_name: userName, state: 'ASK_BIRTH' });
  await wa.sendText(phone, `*${userName}*... a conexão entre vocês dois está ficando mais clara. ${MESSAGES.askBirth}`);
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
      '🔮 A leitura ainda está aqui, esperando por você. A energia não mente — quando quiser, é só digitar *desbloquear*.'
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
