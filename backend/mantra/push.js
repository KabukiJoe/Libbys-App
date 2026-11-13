const defaultStore = require('../store');

const INVALID_TOKEN_CODES = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'];

// Returns a firebase-admin Messaging, or null (push disabled) if the service account is missing or invalid.
function initMessagingFromEnv(env = process.env) {
  try {
    const { initializeApp, cert } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');
    const app = initializeApp({ credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)) });
    return getMessaging(app);
  } catch {
    console.warn('Push notifications disabled (FIREBASE_SERVICE_ACCOUNT missing or invalid)');
    return null;
  }
}

function createPush({ messaging, store }) {
  function addToken(token) {
    store.update((data) => {
      if (!data.pushTokens.includes(token)) data.pushTokens.push(token);
    });
  }

  // Sends to every registered device; drops tokens FCM says are gone. Never throws.
  async function notifyAll({ title, body }) {
    if (!messaging) return;
    const tokens = [...store.load().pushTokens];
    if (!tokens.length) return;

    let response;
    try {
      response = await messaging.sendEachForMulticast({
        tokens,
        notification: { title, body },
        data: { open: 'mantra' },
        // TTL: a mantra notification is useless after the answer time is over.
        android: { priority: 'high', ttl: 300000, notification: { channelId: 'mantra' } },
      });
    } catch (err) {
      console.error('Push failed:', err.message);
      return;
    }

    const gone = tokens.filter((_, i) => {
      const result = response.responses[i];
      return result && !result.success && INVALID_TOKEN_CODES.includes(result.error?.code);
    });
    if (gone.length) {
      store.update((data) => {
        data.pushTokens = data.pushTokens.filter((t) => !gone.includes(t));
      });
    }
    console.log(`Push sent to ${tokens.length - gone.length} device(s)`);
  }

  return { enabled: Boolean(messaging), addToken, notifyAll };
}

const instance = createPush({ messaging: initMessagingFromEnv(), store: defaultStore });

module.exports = {
  createPush,
  initMessagingFromEnv,
  enabled: instance.enabled,
  addToken: instance.addToken,
  notifyAll: instance.notifyAll,
};
