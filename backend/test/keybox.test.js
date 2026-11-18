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

test('GET is 404 before anything is backed up', async () => {
  const res = await get();
  assert.strictEqual(res.status, 404);
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

test('POST stores the lock and GET returns exactly it', async () => {
  const res = await post({ lockData: lock() });
  assert.strictEqual(res.status, 200);
  const got = await get();
  assert.strictEqual(got.status, 200);
  assert.deepStrictEqual(await got.json(), { lockData: lock() });
});

test('the lock survives a server restart (written to the data file)', async () => {
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
  assert.deepStrictEqual(saved.keybox.lockData, lock());
});

test('POST overwrites the previous backup', async () => {
  const next = lock();
  next.address = '11:22:33:44:55:66';
  assert.strictEqual((await post({ lockData: next })).status, 200);
  assert.deepStrictEqual(await (await get()).json(), { lockData: next });
});

test('POST rejects invalid lock data and keeps the previous backup', async () => {
  const before = await (await get()).json();
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
  assert.deepStrictEqual(await (await get()).json(), before);
});

test('error responses never echo the key material', async () => {
  const res = await post({ lockData: { ...lock(), address: '' } });
  const text = await res.text();
  assert.ok(!text.includes('00112233445566778899aabbccddeeff'));
});
