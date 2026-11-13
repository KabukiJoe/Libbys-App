const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('store drops legacy pushSubscriptions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'libby-store-'));
  fs.writeFileSync(
    path.join(dir, 'data.json'),
    JSON.stringify({ pushSubscriptions: [{ endpoint: 'x' }], stats: { success: 1, failed: 0 } }),
  );
  process.env.DATA_DIR = dir;
  const storePath = require.resolve('../store');
  delete require.cache[storePath];
  const store = require('../store');
  store.update(() => {});
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
  assert.ok(!('pushSubscriptions' in saved));
  assert.deepStrictEqual(saved.pushTokens, []);
  assert.strictEqual(saved.stats.success, 1);
  delete require.cache[storePath];
  delete process.env.DATA_DIR;
});
