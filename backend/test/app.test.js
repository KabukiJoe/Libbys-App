const test = require('node:test');
const assert = require('node:assert');

process.env.APP_PASSWORD = 'pw';
const { createApp } = require('../app');

const ORIGIN = 'https://localhost';
let server;
let base;

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const auth = { Authorization: 'Bearer pw' };

test('preflight from the app origin succeeds without password', async () => {
  const res = await fetch(`${base}/api/mantra`, {
    method: 'OPTIONS',
    headers: {
      Origin: ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  });
  assert.strictEqual(res.status, 204);
  assert.strictEqual(res.headers.get('access-control-allow-origin'), ORIGIN);
  assert.match(res.headers.get('access-control-allow-headers'), /Authorization/);
});

test('app origin gets CORS header on real requests', async () => {
  const res = await fetch(`${base}/api/auth-check`, { headers: { Origin: ORIGIN, ...auth } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('access-control-allow-origin'), ORIGIN);
});

test('other origins get no CORS header', async () => {
  const res = await fetch(`${base}/api/auth-check`, {
    headers: { Origin: 'https://evil.example', ...auth },
  });
  assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
});

test('password still required', async () => {
  const res = await fetch(`${base}/api/auth-check`);
  assert.strictEqual(res.status, 401);
});

test('frontend is no longer served', async () => {
  const res = await fetch(`${base}/`);
  assert.strictEqual(res.status, 404);
});

test('subscribe rejects missing token', async () => {
  const res = await fetch(`${base}/api/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: '{}',
  });
  assert.strictEqual(res.status, 400);
});
