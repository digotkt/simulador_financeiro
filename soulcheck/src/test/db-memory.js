const { v4: uuidv4 } = require('uuid');

// In-memory storage for testing
const users = new Map();
const sessions = new Map();
const payments = new Map();

function findOrCreateUser(chatId) {
  const id = String(chatId);
  if (users.has(id)) return users.get(id);
  const user = { id: uuidv4(), chat_id: id, created_at: new Date().toISOString() };
  users.set(id, user);
  return user;
}

function getActiveSession(chatId) {
  const id = String(chatId);
  for (const session of sessions.values()) {
    if (session.chat_id === id && session.payment_status === 'pending') {
      return session;
    }
  }
  return null;
}

function createSession(chatId) {
  const user = findOrCreateUser(chatId);
  const session = {
    id: uuidv4(),
    user_id: user.id,
    chat_id: String(chatId),
    user_name: null,
    target_name: null,
    birth_date: null,
    state: 'WELCOME',
    partial_response: null,
    full_response: null,
    payment_status: 'pending',
    created_at: new Date().toISOString(),
  };
  sessions.set(session.id, session);
  return session;
}

function updateSession(id, updates) {
  const session = sessions.get(id);
  if (!session) return null;
  Object.assign(session, updates, { updated_at: new Date().toISOString() });
  return session;
}

function createPayment(sessionId, chatId, amount, provider, providerId) {
  const payment = {
    id: uuidv4(),
    session_id: sessionId,
    chat_id: String(chatId),
    amount,
    provider,
    provider_id: providerId,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  payments.set(payment.id, payment);
  return payment;
}

function completePayment(sessionId) {
  // Find payment for this session
  for (const payment of payments.values()) {
    if (payment.session_id === sessionId && payment.status === 'pending') {
      payment.status = 'completed';
      const session = sessions.get(sessionId);
      if (session) {
        session.payment_status = 'completed';
      }
      return session;
    }
  }
  return null;
}

function getSessionById(id) {
  return sessions.get(id) || null;
}

function debugDump() {
  return {
    users: Object.fromEntries(users),
    sessions: Object.fromEntries(sessions),
    payments: Object.fromEntries(payments),
  };
}

module.exports = {
  findOrCreateUser,
  getActiveSession,
  createSession,
  updateSession,
  createPayment,
  completePayment,
  getSessionById,
  debugDump,
};
