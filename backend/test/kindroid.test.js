const test = require('node:test');
const assert = require('node:assert');
const { sendKinMessage } = require('../kindroid');

test('sendKinMessage targets the configured AI with a direct message', async () => {
  const saved = {
    apiKey: process.env.KINDROID_API_KEY,
    aiId: process.env.KINDROID_AI_ID,
    fetch: global.fetch,
  };
  process.env.KINDROID_API_KEY = 'test-key';
  process.env.KINDROID_AI_ID = 'test-ai';
  let call;
  global.fetch = async (url, options) => {
    call = { url, options };
    return new Response('reply', { status: 200, headers: { 'content-type': 'text/plain' } });
  };

  try {
    await sendKinMessage({ message: 'Daily summary' });
    assert.strictEqual(call.url, 'https://api.kindroid.ai/v1/send-message');
    assert.strictEqual(call.options.method, 'POST');
    assert.strictEqual(call.options.headers.Authorization, 'Bearer test-key');
    assert.deepStrictEqual(JSON.parse(call.options.body), {
      ai_id: 'test-ai',
      message: 'Daily summary',
    });
  } finally {
    if (saved.apiKey === undefined) delete process.env.KINDROID_API_KEY;
    else process.env.KINDROID_API_KEY = saved.apiKey;
    if (saved.aiId === undefined) delete process.env.KINDROID_AI_ID;
    else process.env.KINDROID_AI_ID = saved.aiId;
    global.fetch = saved.fetch;
  }
});
