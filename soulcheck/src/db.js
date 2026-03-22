const axios = require('axios');
const config = require('./config');

const supabase = axios.create({
  baseURL: `${config.supabase.url}/rest/v1`,
  headers: {
    apikey: config.supabase.key,
    Authorization: `Bearer ${config.supabase.key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  },
});

async function findOrCreateUser(phone) {
  const { data: existing } = await supabase.get(`/users?phone=eq.${phone}&limit=1`);
  if (existing && existing.length > 0) return existing[0];

  const { data: created } = await supabase.post('/users', { phone });
  return created[0];
}

async function getActiveSession(phone) {
  const { data } = await supabase.get(
    `/sessions?phone=eq.${phone}&payment_status=eq.pending&order=created_at.desc&limit=1`
  );
  return data && data.length > 0 ? data[0] : null;
}

async function createSession(phone) {
  const user = await findOrCreateUser(phone);
  const { data } = await supabase.post('/sessions', {
    user_id: user.id,
    phone,
    state: 'WELCOME',
  });
  return data[0];
}

async function updateSession(id, updates) {
  updates.updated_at = new Date().toISOString();
  const { data } = await supabase.patch(`/sessions?id=eq.${id}`, updates);
  return data[0];
}

async function createPayment(sessionId, phone, amount, provider, providerId) {
  const { data } = await supabase.post('/payments', {
    session_id: sessionId,
    phone,
    amount,
    provider,
    provider_id: providerId,
    status: 'pending',
  });
  return data[0];
}

async function completePayment(providerId) {
  const { data: payments } = await supabase.get(
    `/payments?provider_id=eq.${providerId}&limit=1`
  );
  if (!payments || payments.length === 0) return null;

  const payment = payments[0];
  await supabase.patch(`/payments?id=eq.${payment.id}`, { status: 'completed' });
  await supabase.patch(`/sessions?id=eq.${payment.session_id}`, {
    payment_status: 'completed',
    updated_at: new Date().toISOString(),
  });

  const { data: sessions } = await supabase.get(
    `/sessions?id=eq.${payment.session_id}&limit=1`
  );
  return sessions[0];
}

module.exports = {
  findOrCreateUser,
  getActiveSession,
  createSession,
  updateSession,
  createPayment,
  completePayment,
};
