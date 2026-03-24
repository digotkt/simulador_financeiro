/*
  Analytics - Sistema de tracking e aprendizado do SoulCheck

  Registra cada interacao pra:
  1. Medir conversao (quem pagou vs quem desistiu)
  2. Identificar em qual etapa as pessoas desistem
  3. Rankear quais leituras parciais convertem melhor
  4. Medir tempo de resposta do usuario (engajamento)
  5. Gerar insights pra evoluir prompts e mensagens

  Em producao: substituir por Postgres/Redis
  Hoje: in-memory com export pra JSON
*/

const fs = require('fs');
const path = require('path');

// Storage
const events = [];
const sessionMetrics = new Map();
const globalMetrics = {
  totalSessions: 0,
  completedOnboarding: 0,
  reachedPaywall: 0,
  converted: 0,
  totalRevenue: 0,
  avgResponseTimeMs: 0,
  dropoffByState: {},
  bestPartialReadings: [], // top converting partial readings
};

// Log an event
function track(sessionId, eventName, data = {}) {
  const event = {
    sessionId,
    event: eventName,
    data,
    timestamp: Date.now(),
  };
  events.push(event);

  // Update session metrics
  if (!sessionMetrics.has(sessionId)) {
    sessionMetrics.set(sessionId, {
      sessionId,
      startedAt: Date.now(),
      events: [],
      userMessages: [],
      responseTimes: [],
      lastActivity: Date.now(),
      converted: false,
      dropoffState: null,
    });
  }

  const sm = sessionMetrics.get(sessionId);
  sm.events.push(event);
  sm.lastActivity = Date.now();

  // Track specific events
  switch (eventName) {
    case 'session_start':
      globalMetrics.totalSessions++;
      break;
    case 'user_message':
      sm.userMessages.push(data.text || '');
      if (data.responseTimeMs) {
        sm.responseTimes.push(data.responseTimeMs);
      }
      break;
    case 'onboarding_complete':
      globalMetrics.completedOnboarding++;
      break;
    case 'paywall_reached':
      globalMetrics.reachedPaywall++;
      break;
    case 'payment_completed':
      sm.converted = true;
      globalMetrics.converted++;
      globalMetrics.totalRevenue += data.amount || 0;
      // Score the partial reading that led to conversion
      if (data.partialReading) {
        globalMetrics.bestPartialReadings.push({
          reading: data.partialReading.substring(0, 200),
          sessionId,
          timestamp: Date.now(),
        });
        // Keep only top 20
        if (globalMetrics.bestPartialReadings.length > 20) {
          globalMetrics.bestPartialReadings.shift();
        }
      }
      break;
    case 'session_abandoned':
      sm.dropoffState = data.state;
      globalMetrics.dropoffByState[data.state] = (globalMetrics.dropoffByState[data.state] || 0) + 1;
      break;
  }
}

// Track user message with response time
function trackMessage(sessionId, text, state) {
  const sm = sessionMetrics.get(sessionId);
  const responseTimeMs = sm ? Date.now() - sm.lastActivity : 0;
  track(sessionId, 'user_message', { text, state, responseTimeMs });
  return responseTimeMs;
}

// Get session metrics
function getSessionData(sessionId) {
  return sessionMetrics.get(sessionId) || null;
}

// Get user's message history (for AI context)
function getUserMessages(sessionId) {
  const sm = sessionMetrics.get(sessionId);
  return sm ? sm.userMessages : [];
}

// Get dashboard metrics
function getDashboard() {
  const conversionRate = globalMetrics.reachedPaywall > 0
    ? ((globalMetrics.converted / globalMetrics.reachedPaywall) * 100).toFixed(1)
    : '0';

  const onboardingRate = globalMetrics.totalSessions > 0
    ? ((globalMetrics.completedOnboarding / globalMetrics.totalSessions) * 100).toFixed(1)
    : '0';

  // Calculate avg response time
  let totalResponseTime = 0;
  let totalResponses = 0;
  for (const sm of sessionMetrics.values()) {
    for (const rt of sm.responseTimes) {
      totalResponseTime += rt;
      totalResponses++;
    }
  }

  return {
    totalSessions: globalMetrics.totalSessions,
    completedOnboarding: globalMetrics.completedOnboarding,
    onboardingRate: `${onboardingRate}%`,
    reachedPaywall: globalMetrics.reachedPaywall,
    converted: globalMetrics.converted,
    conversionRate: `${conversionRate}%`,
    totalRevenue: `R$ ${globalMetrics.totalRevenue.toFixed(2)}`,
    avgResponseTimeMs: totalResponses > 0 ? Math.round(totalResponseTime / totalResponses) : 0,
    dropoffByState: globalMetrics.dropoffByState,
    bestPartialReadings: globalMetrics.bestPartialReadings.length,
    recentEvents: events.slice(-20).map((e) => `${e.event} [${e.sessionId.slice(0, 8)}]`),
  };
}

// Export data to JSON file (for analysis)
function exportData(filePath) {
  const data = {
    exportedAt: new Date().toISOString(),
    dashboard: getDashboard(),
    globalMetrics,
    sessions: Object.fromEntries(sessionMetrics),
    totalEvents: events.length,
  };

  const outputPath = filePath || path.join(__dirname, '..', 'analytics-export.json');
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  return outputPath;
}

// Check for abandoned sessions (no activity in 10 min)
function checkAbandoned() {
  const threshold = 10 * 60 * 1000; // 10 minutes
  const now = Date.now();

  for (const [id, sm] of sessionMetrics) {
    if (!sm.converted && !sm.dropoffState && (now - sm.lastActivity) > threshold) {
      const lastEvent = sm.events[sm.events.length - 1];
      const state = lastEvent?.data?.state || 'unknown';
      track(id, 'session_abandoned', { state });
    }
  }
}

// Run abandoned check every 5 minutes
setInterval(checkAbandoned, 5 * 60 * 1000);

module.exports = {
  track,
  trackMessage,
  getSessionData,
  getUserMessages,
  getDashboard,
  exportData,
};
