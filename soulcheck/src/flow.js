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

// Pick random item from array
function pick(arr) {
  return Array.isArray(arr) ? arr[Math.floor(Math.random() * arr.length)] : arr;
}

// Validates that text looks like a real name
function isValidName(text) {
  const cleaned = text.trim();
  if (cleaned.length < 2 || cleaned.length > 50) return false;
  if (/[\/\\@#$%^&*()=+\[\]{}<>|~`0-9]/.test(cleaned)) return false;
  if (/\b(cd|npm|node|sudo|rm|ls|cat|echo|install|run|test|http|www)\b/i.test(cleaned)) return false;
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
    '\n\ntem mais alguem que voce quer descobrir? manda *nova analise* que eu sinto a energia ✨',
    '\n\nquer saber sobre outra pessoa? e so mandar *nova analise* ✨',
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

async function handleMessage(phone, text) {
  try {
    let session = await db.getActiveSession(phone);

    if (
      !session ||
      text.toLowerCase().includes('nova análise') ||
      text.toLowerCase().includes('nova analise') ||
      text.toLowerCase() === 'iniciar'
    ) {
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
        return await wa.sendText(phone, pick(MESSAGES.error));
    }
  } catch (err) {
    console.error('[Flow] Error:', err);
    await wa.sendText(phone, pick(MESSAGES.error));
  }
}

async function startNewSession(phone) {
  await db.createSession(phone);
  await wa.sendWithDelay(phone, pick(MESSAGES.welcome));
  const session = await db.getActiveSession(phone);
  await db.updateSession(session.id, { state: 'ASK_TARGET' });
}

async function handleTargetName(session, phone, text) {
  const targetName = text.trim();
  if (!isValidName(targetName)) {
    return await wa.sendText(phone, pick(MESSAGES.invalidName));
  }
  await db.updateSession(session.id, { target_name: targetName, state: 'ASK_USER_NAME' });
  const reaction = pick(MESSAGES.targetReaction).replace('{name}', targetName);
  await wa.sendText(phone, reaction);
  await wa.sendText(phone, pick(MESSAGES.askUserName));
}

async function handleUserName(session, phone, text) {
  const userName = text.trim();
  if (!isValidName(userName)) {
    return await wa.sendText(phone, pick(MESSAGES.invalidName));
  }
  await db.updateSession(session.id, { user_name: userName, state: 'ASK_BIRTH' });
  const reaction = pick(MESSAGES.userReaction).replace('{name}', userName);
  await wa.sendText(phone, reaction);
  await wa.sendText(phone, pick(MESSAGES.askBirth));
}

async function handleBirthDate(session, phone, text) {
  const birthDate = wantsToSkip(text) ? null : text.trim();

  await db.updateSession(session.id, {
    birth_date: birthDate,
    state: 'GENERATING',
  });

  await wa.sendText(phone, pick(MESSAGES.generating));

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

  // Pause for emotional impact (3-5s)
  await new Promise((resolve) => setTimeout(resolve, 3000 + Math.random() * 2000));

  // Send paywall messages
  await wa.sendWithDelay(phone, pick(MESSAGES.paywall));

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
    `🔗 toque aqui pra desbloquear:\n${checkout.url}`
  );
}

async function handlePaywallResponse(session, phone, text) {
  if (wantsToPay(text)) {
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
      `🔗 toque aqui pra desbloquear:\n${checkout.url}`
    );
  } else {
    await wa.sendText(
      phone,
      'a leitura ainda ta aqui, esperando por voce. quando quiser, e so digitar *desbloquear* 🔮'
    );
  }
}

async function deliverFullReading(session) {
  const phone = session.phone;
  await wa.sendText(phone, pick(MESSAGES.paymentSuccess));

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
  await wa.sendText(phone, pick(MESSAGES.completed));
}

module.exports = {
  handleMessage,
  deliverFullReading,
};
