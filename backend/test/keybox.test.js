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
