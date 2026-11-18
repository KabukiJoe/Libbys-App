const test = require('node:test');
const assert = require('node:assert');
const { getKeyword, findApproval, grantWindowMs, buildRequestMessage, NOTE_MAX } = require('../keyboxGate');

test('approves on whole-token keyword, case-insensitive, and strips it', () => {
  assert.deepStrictEqual(findApproval('Fine, go ahead. bluebird', 'BLUEBIRD'), { approved: true, text: 'Fine, go ahead.' });
  assert.deepStrictEqual(findApproval('Yes BLUEBIRD, have fun', 'BLUEBIRD'), { approved: true, text: 'Yes, have fun' });
});
test('no keyword, or keyword inside a longer token, is not approval', () => {
  assert.strictEqual(findApproval('Not today.', 'BLUEBIRD').approved, false);
  assert.strictEqual(findApproval('BLUEBIRDS fly', 'BLUEBIRD').approved, false);
  assert.strictEqual(findApproval('xBLUEBIRD', 'BLUEBIRD').approved, false);
  assert.strictEqual(findApproval('BLUEBIRD-2', 'BLUEBIRD').approved, false);
  assert.strictEqual(findApproval('Not today.', 'BLUEBIRD').text, 'Not today.');
});
test('findApproval matches mixed-case input and strips every occurrence', () => {
  assert.deepStrictEqual(findApproval('BlueBird yes, bluebird again', 'bluebird'), { approved: true, text: 'yes, again' });
  assert.deepStrictEqual(findApproval('bLuEbIrD and BLUEBIRD', 'Bluebird'), { approved: true, text: 'and' });
});
test('getKeyword rejects missing, short or odd keywords', () => {
  assert.strictEqual(getKeyword({}), null);
  assert.strictEqual(getKeyword({ KEYBOX_UNLOCK_KEYWORD: 'abc' }), null);
  assert.strictEqual(getKeyword({ KEYBOX_UNLOCK_KEYWORD: 'two words' }), null);
  assert.strictEqual(getKeyword({ KEYBOX_UNLOCK_KEYWORD: 'Blue_bird-7' }), 'Blue_bird-7');
  assert.strictEqual(getKeyword({ KEYBOX_UNLOCK_KEYWORD: 'abcde' }), null);
  assert.strictEqual(getKeyword({ KEYBOX_UNLOCK_KEYWORD: 'abcdef' }), 'abcdef');
  const long = 'a'.repeat(70);
  assert.strictEqual(getKeyword({ KEYBOX_UNLOCK_KEYWORD: long }), long);
});
test('grantWindowMs defaults to 120 s and clamps to 60..180 s', () => {
  assert.strictEqual(grantWindowMs({}), 120_000);
  assert.strictEqual(grantWindowMs({ KEYBOX_GRANT_SECONDS: '10' }), 60_000);
  assert.strictEqual(grantWindowMs({ KEYBOX_GRANT_SECONDS: '999' }), 180_000);
  assert.strictEqual(grantWindowMs({ KEYBOX_GRANT_SECONDS: 'abc' }), 120_000);
});
test('buildRequestMessage uses the fixed text and appends a note', () => {
  assert.strictEqual(buildRequestMessage(), "[Keybox request] I'm asking you to open my keybox now.");
  assert.strictEqual(buildRequestMessage('  bored  '), "[Keybox request] I'm asking you to open my keybox now.\n\nMy reason: bored");
});
test('NOTE_MAX is 500', () => {
  assert.strictEqual(NOTE_MAX, 500);
});
test('denied replies never leak the keyword, even inside other words', () => {
  for (const reply of ['No BLUEBIRDS today', 'xBLUEBIRDx', 'BLUEBIRD-ish', 'BLUEBLUEBIRDBIRD', 'BLUEBLUEBLUEBIRDBIRDBIRD']) {
    const r = findApproval(reply, 'BLUEBIRD');
    assert.strictEqual(r.approved, false, reply);
    assert.ok(!r.text.toLowerCase().includes('bluebird'), reply);
  }
  assert.deepStrictEqual(findApproval('Yes BLUEBIRD, have fun', 'BLUEBIRD'), { approved: true, text: 'Yes, have fun' });
});
