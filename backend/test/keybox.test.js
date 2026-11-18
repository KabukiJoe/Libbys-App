const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Isolated data dir, set before the store is first required.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'libby-keybox-'));
process.env.DATA_DIR = dir;
process.env.APP_PASSWORD = 'pw';
const { createApp } = require('../app');

const auth = { Authorization: 'Bearer pw', 'Content-Type': 'application/json' };
// Synthetic lock; never a real key.
const lock = () => ({
  address: 'AA:BB:CC:DD:EE:FF',
  privateData: { aesKey: '00112233445566778899aabbccddeeff', admin: { adminPs: 1, unlockKey: 2 } },
});

let server;
let base;
test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const post = (body) => fetch(`${base}/api/keybox/lock-data`, { method: 'POST', headers: auth, body: JSON.stringify(body) });
const get = () => fetch(`${base}/api/keybox/lock-data`, { headers: auth });
// The server never returns the lock; the only way to read it is the data file on the volume.
const stored = () => {
  const file = path.join(dir, 'data.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).keybox?.lockData : undefined;
};

test('there is no way to read the lock back over the API', async () => {
  assert.strictEqual((await get()).status, 404); // before a backup
  assert.strictEqual((await post({ lockData: lock() })).status, 200);
  assert.strictEqual((await get()).status, 404); // and after
  for (const p of ['/api/keybox', '/api/keybox/lock-data/', '/api/keybox/lockdata']) {
    const res = await fetch(`${base}${p}`, { headers: auth });
    assert.strictEqual(res.status, 404, p);
  }
});

test('the POST response does not echo the lock', async () => {
  const res = await post({ lockData: lock() });
  assert.deepStrictEqual(await res.json(), { ok: true });
});

test('requires the app password', async () => {
  const noAuth = await fetch(`${base}/api/keybox/lock-data`);
  assert.strictEqual(noAuth.status, 401);
  const noAuthPost = await fetch(`${base}/api/keybox/lock-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lockData: lock() }),
  });
  assert.strictEqual(noAuthPost.status, 401);
});

test('POST stores exactly the lock in the data file (survives a restart)', async () => {
  const res = await post({ lockData: lock() });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(stored(), lock());
});

test('POST overwrites the previous backup', async () => {
  const next = lock();
  next.address = '11:22:33:44:55:66';
  assert.strictEqual((await post({ lockData: next })).status, 200);
  assert.deepStrictEqual(stored(), next);
});

test('POST rejects invalid lock data and keeps the previous backup', async () => {
  const before = stored();
  const cases = [
    {},
    { lockData: null },
    { lockData: 'text' },
    { lockData: [lock()] },
    { lockData: { ...lock(), address: '' } },
    { lockData: { ...lock(), privateData: { ...lock().privateData, aesKey: 'zz' } } },
    { lockData: { ...lock(), privateData: { ...lock().privateData, aesKey: '00112233' } } },
    { lockData: { ...lock(), privateData: { aesKey: lock().privateData.aesKey } } },
    { lockData: { ...lock(), privateData: { ...lock().privateData, admin: { unlockKey: -1 } } } },
    { lockData: { ...lock(), privateData: { ...lock().privateData, admin: { unlockKey: '5' } } } },
  ];
  for (const body of cases) {
    const res = await post(body);
    assert.strictEqual(res.status, 400, JSON.stringify(body));
  }
  assert.deepStrictEqual(stored(), before);
});

test('error responses never echo the key material', async () => {
  const res = await post({ lockData: { ...lock(), address: '' } });
  const text = await res.text();
  assert.ok(!text.includes('00112233445566778899aabbccddeeff'));
});

// ---- Libby-approved open window (createKeyboxRouter) ----
const express = require('express');
const { createKeyboxRouter } = require('../keybox');
const store = require('../store');
const { buildRequestMessage } = require('../keyboxGate');

const ENV = { KEYBOX_UNLOCK_KEYWORD: 'BLUEBIRD', KEYBOX_GRANT_SECONDS: '120' };

async function gateHarness({ reply = 'Sure, BLUEBIRD.', env = ENV, fail } = {}) {
  const h = { clock: 1_000_000, calls: [] };
  const askKin = async ({ message }) => {
    h.calls.push(message);
    if (fail) throw fail;
    return reply;
  };
  const make = () =>
    express().use(express.json()).use('/api', createKeyboxRouter({ askKin, now: () => h.clock, env }));
  const srv = make().listen(0);
  await new Promise((r) => srv.once('listening', r));
  h.srv = srv;
  h.url = `http://127.0.0.1:${srv.address().port}/api/keybox`;
  h.call = (p, body) =>
    fetch(`${h.url}${p}`, {
      method: body === undefined && p === '/status' ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? (p === '/status' ? undefined : '{}') : JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
  h.make = make;
  return h;
}

async function gateSetup(opts) {
  store.update((d) => {
    d.keybox = { lockData: lock() };
  });
  return gateHarness(opts);
}

test('credentials are refused without a grant', async () => {
  const h = await gateSetup();
  const r = await h.call('/credentials');
  assert.strictEqual(r.status, 403);
  assert.deepStrictEqual(r.body, { error: 'Not approved' });
  h.srv.close();
});

test('a reply without the keyword grants nothing', async () => {
  const h = await gateSetup({ reply: 'No.' });
  const r = await h.call('/request', {});
  assert.deepStrictEqual(r.body, { approved: false, reply: 'No.', grant: { active: false, expiresInMs: 0 } });
  assert.strictEqual((await h.call('/credentials')).status, 403);
  h.srv.close();
});

test('a reply with the keyword opens a 120 s window', async () => {
  const h = await gateSetup();
  const r = await h.call('/request', {});
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.approved, true);
  assert.ok(!r.body.reply.includes('BLUEBIRD'));
  assert.strictEqual(r.body.grant.expiresInMs, 120000);
  const c = await h.call('/credentials');
  assert.strictEqual(c.status, 200);
  assert.deepStrictEqual(c.body, { lockData: lock() });
  h.srv.close();
});

test('the grant expires', async () => {
  const h = await gateSetup();
  await h.call('/request', {});
  h.clock += 120_001;
  const s = await h.call('/status');
  assert.deepStrictEqual(s.body, { hasLock: true, grant: { active: false, expiresInMs: 0 } });
  assert.strictEqual((await h.call('/credentials')).status, 403);
  h.srv.close();
});

test('a second request during the window does not ask Libby', async () => {
  const h = await gateSetup();
  await h.call('/request', {});
  const r = await h.call('/request', {});
  assert.strictEqual(h.calls.length, 1);
  assert.strictEqual(r.body.approved, true);
  assert.strictEqual(r.body.reply, '');
  h.srv.close();
});

test('grant/end closes the window', async () => {
  const h = await gateSetup();
  await h.call('/request', {});
  assert.deepStrictEqual((await h.call('/grant/end')).body, { ok: true });
  assert.strictEqual((await h.call('/credentials')).status, 403);
  h.srv.close();
});

test('the grant survives a restart', async () => {
  const h = await gateSetup();
  await h.call('/request', {});
  const h2Srv = h.make().listen(0); // a second router instance over the same data file
  await new Promise((r) => h2Srv.once('listening', r));
  const res = await fetch(`http://127.0.0.1:${h2Srv.address().port}/api/keybox/status`);
  const body = await res.json();
  assert.strictEqual(body.grant.active, true);
  assert.ok(fs.readFileSync(path.join(dir, 'data.json'), 'utf8').includes('expiresAt'));
  h2Srv.close();
  h.srv.close();
});

test('lock-data backup does not wipe a stored grant', async () => {
  const h = await gateSetup();
  await h.call('/request', {});
  assert.strictEqual((await post({ lockData: lock() })).status, 200);
  assert.strictEqual((await h.call('/status')).body.grant.active, true);
  h.srv.close();
});

test('Kindroid failure is a 502 and grants nothing', async () => {
  const h = await gateSetup({ fail: new Error('Kindroid took too long to reply') });
  const r = await h.call('/request', {});
  assert.strictEqual(r.status, 502);
  assert.deepStrictEqual(r.body, { error: 'Kindroid took too long to reply' });
  assert.strictEqual((await h.call('/status')).body.grant.active, false);
  h.srv.close();
});

test('a note with the keyword, over 500 chars, or not a string is rejected', async () => {
  const h = await gateSetup();
  const kw = await h.call('/request', { note: 'please bluebird now' });
  assert.strictEqual(kw.status, 400);
  assert.deepStrictEqual(kw.body, { error: 'Note not allowed' });
  assert.strictEqual((await h.call('/request', { note: 'x'.repeat(501) })).status, 400);
  assert.strictEqual((await h.call('/request', { note: 5 })).status, 400);
  assert.strictEqual((await h.call('/request', { note: 'x'.repeat(500) })).status, 200);
  assert.strictEqual(h.calls.length, 1); // only the valid one reached Libby
  h.srv.close();
});

test('fails closed without a keyword', async () => {
  const h = await gateSetup({ env: {} });
  for (const p of ['/status', '/request', '/credentials', '/grant/end']) {
    const r = await h.call(p);
    assert.strictEqual(r.status, 503, p);
    assert.deepStrictEqual(r.body, { error: 'Keybox gate is not configured' });
  }
  assert.strictEqual(h.calls.length, 0);
  h.srv.close();
});

test('credentials 404 when no lock is stored', async () => {
  store.update((d) => {
    d.keybox = {};
  });
  const h = await gateHarness();
  await h.call('/request', {});
  const r = await h.call('/credentials');
  assert.strictEqual(r.status, 404);
  assert.deepStrictEqual(r.body, { error: 'No lock data' });
  assert.strictEqual((await h.call('/status')).body.hasLock, false);
  h.srv.close();
});

test('the message sent to Libby is the fixed text plus note', async () => {
  const h = await gateSetup();
  await h.call('/request', { note: 'bored' });
  assert.deepStrictEqual(h.calls, [buildRequestMessage('bored')]);
  h.srv.close();
});
