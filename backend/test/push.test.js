const test = require('node:test');
const assert = require('node:assert');
const { createPush, initMessagingFromEnv } = require('../mantra/push');

function setup(tokens, { responses, throws } = {}) {
  const data = { pushTokens: [...tokens] };
  const store = { load: () => data, update: (fn) => fn(data) };
  const sent = [];
  const messaging = {
    sendEachForMulticast: async (msg) => {
      sent.push(msg);
      if (throws) throw new Error('fcm down');
      return { responses: responses || msg.tokens.map(() => ({ success: true })) };
    },
  };
  return { data, store, sent, push: createPush({ messaging, store }) };
}

const PAYLOAD = { title: 'Libby', body: 'You have a new Mantra' };

test('addToken stores each token once', () => {
  const { push, data } = setup([]);
  push.addToken('a');
  push.addToken('a');
  push.addToken('b');
  assert.deepStrictEqual(data.pushTokens, ['a', 'b']);
});

test('notifyAll sends to all tokens with mantra options', async () => {
  const { push, sent } = setup(['a', 'b']);
  await push.notifyAll(PAYLOAD);
  assert.strictEqual(sent.length, 1);
  const msg = sent[0];
  assert.deepStrictEqual(msg.tokens, ['a', 'b']);
  assert.deepStrictEqual(msg.notification, PAYLOAD);
  assert.deepStrictEqual(msg.data, { open: 'mantra' });
  assert.strictEqual(msg.android.priority, 'high');
  assert.strictEqual(msg.android.ttl, 300000);
  assert.strictEqual(msg.android.notification.channelId, 'mantra');
});

test('notifyAll removes invalid tokens', async () => {
  const { push, data } = setup(['a', 'b', 'c'], {
    responses: [
      { success: true },
      { success: false, error: { code: 'messaging/registration-token-not-registered' } },
      { success: false, error: { code: 'messaging/internal-error' } },
    ],
  });
  await push.notifyAll(PAYLOAD);
  assert.deepStrictEqual(data.pushTokens, ['a', 'c']);
});

test('notifyAll with no tokens does not call FCM', async () => {
  const { push, sent } = setup([]);
  await push.notifyAll(PAYLOAD);
  assert.strictEqual(sent.length, 0);
});

test('notifyAll survives FCM rejecting', async () => {
  const { push, data } = setup(['a', 'b'], { throws: true });
  await push.notifyAll(PAYLOAD);
  assert.deepStrictEqual(data.pushTokens, ['a', 'b']);
});

test('disabled push does nothing', async () => {
  const data = { pushTokens: ['a'] };
  const push = createPush({ messaging: null, store: { load: () => data, update: (fn) => fn(data) } });
  assert.strictEqual(push.enabled, false);
  await push.notifyAll(PAYLOAD);
  assert.deepStrictEqual(data.pushTokens, ['a']);
});

test('initMessagingFromEnv returns null for missing or malformed config', () => {
  assert.strictEqual(initMessagingFromEnv({}), null);
  assert.strictEqual(initMessagingFromEnv({ FIREBASE_SERVICE_ACCOUNT: 'not json' }), null);
});
