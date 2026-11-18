const test = require('node:test');
const assert = require('node:assert');
const { DateTime } = require('luxon');
const config = require('../mantra/config');
const { planDay, planSlots, localDay } = require('../mantra/plan');
const { ensureStats, recordResult, publicStats } = require('../mantra/stats');
const { isCorrect } = require('../mantra');

const berlin = (iso) => DateTime.fromISO(iso, { zone: 'Europe/Berlin' }).toMillis();
const hour = (ms) => DateTime.fromMillis(ms, { zone: 'Europe/Berlin' }).toFormat('HH:mm');

test('daily stats reset at local midnight while weekly stats reset on Monday', () => {
  const data = {};
  const monday = berlin('2026-06-15T12:00');
  const stats = ensureStats(data, monday, config.timezone);
  recordResult(stats, true);
  recordResult(stats, false);

  const tuesday = ensureStats(data, berlin('2026-06-16T00:01'), config.timezone);
  assert.deepStrictEqual(publicStats(tuesday), {
    daily: { success: 0, failed: 0 },
    weekly: { success: 1, failed: 1 },
  });

  const followingMonday = ensureStats(data, berlin('2026-06-22T00:00'), config.timezone);
  assert.deepStrictEqual(publicStats(followingMonday), {
    daily: { success: 0, failed: 0 },
    weekly: { success: 0, failed: 0 },
  });
});

// Days around both DST switches plus a normal one.
const DAYS = ['2026-03-29', '2026-06-15', '2026-10-25'];

test('plans 3-5 mantras between 08:00 and 20:00, at least 1h apart', () => {
  for (const day of DAYS) {
    for (let i = 0; i < 2000; i++) {
      const { date, slots } = planDay({ now: berlin(`${day}T02:00`), config });
      assert.strictEqual(date, day);
      assert.ok(slots.length >= 3 && slots.length <= 5, `count ${slots.length}`);
      for (const at of slots) {
        assert.ok(at >= berlin(`${day}T08:00`) && at <= berlin(`${day}T20:00`), `out of window: ${hour(at)}`);
      }
      for (let j = 1; j < slots.length; j++) {
        assert.ok(slots[j] - slots[j - 1] >= config.gapMs, `gap too small: ${hour(slots[j - 1])}-${hour(slots[j])}`);
      }
    }
  }
});

test('uses every count from 3 to 5', () => {
  const counts = new Set();
  for (let i = 0; i < 500; i++) counts.add(planDay({ now: berlin('2026-06-15T02:00'), config }).slots.length);
  assert.deepStrictEqual([...counts].sort(), [3, 4, 5]);
});

test('late planning only uses the rest of the window and shrinks the count', () => {
  const now = berlin('2026-06-15T18:30');
  for (let i = 0; i < 500; i++) {
    const { slots } = planDay({ now, config });
    assert.ok(slots.length <= 2, `count ${slots.length}`); // 18:30-20:00 fits at most 2
    for (const at of slots) assert.ok(at >= now);
  }
  assert.deepStrictEqual(planDay({ now: berlin('2026-06-15T21:00'), config }).slots, []);
});

test('planSlots handles the tightest fit', () => {
  const slots = planSlots({ count: 3, start: 0, end: 2 * config.gapMs, gapMs: config.gapMs });
  assert.deepStrictEqual(slots, [0, config.gapMs, 2 * config.gapMs]);
});

test('planning is due from 02:00 Berlin time', () => {
  assert.strictEqual(localDay(berlin('2026-06-15T01:59'), config).pastPlanTime, false);
  assert.strictEqual(localDay(berlin('2026-06-15T02:00'), config).pastPlanTime, true);
  assert.strictEqual(localDay(berlin('2026-06-15T01:59'), config).date, '2026-06-15');
});

test('answers are case sensitive, outer whitespace ignored', () => {
  assert.ok(isCorrect('I am calm.', 'I am calm.'));
  assert.ok(isCorrect('  I am calm. \n', 'I am calm.'));
  assert.ok(!isCorrect('i am calm.', 'I am calm.'));
  assert.ok(!isCorrect('I am calm', 'I am calm.'));
  assert.ok(!isCorrect('I am calme.', 'I am calm.'));
});

test('typographic apostrophes and quotes match the plain keyboard ones', () => {
  assert.ok(isCorrect("I am Libby's.", 'I am Libby’s.'));
  assert.ok(isCorrect('I am Libby’s.', "I am Libby's."));
  for (const q of ['‘', '‚', '´', '`', 'ʼ']) assert.ok(isCorrect("Libby's", `Libby${q}s`), q);
  for (const q of ['“…”', '„…“', '«…»']) {
    const text = `She said ${q[0]}obey${q[2]}.`;
    assert.ok(isCorrect('She said "obey".', text), text);
  }
});

test('dashes, ellipsis and special spaces match their plain versions', () => {
  assert.ok(isCorrect('Calm - and quiet.', 'Calm – and quiet.'));
  assert.ok(isCorrect('Calm - and quiet.', 'Calm — and quiet.'));
  assert.ok(isCorrect('I wait...', 'I wait…'));
  assert.ok(isCorrect('I am calm.', 'I am calm.'));
  assert.ok(isCorrect('I am  calm.', 'I am calm.'));
  assert.ok(isCorrect('I am\ncalm.', 'I am calm.'));
});

test('emojis are ignored', () => {
  assert.ok(isCorrect('I am calm.', 'I am calm. 💜'));
  assert.ok(isCorrect('I am calm.', 'I am 🧘‍♀️ calm.'));
  assert.ok(isCorrect('I am calm. 💜', 'I am calm.'));
});

test('case, letters and punctuation stay strict', () => {
  assert.ok(!isCorrect("i am libby's.", "I am Libby's."));
  assert.ok(!isCorrect('Ich gehore Libby.', 'Ich gehöre Libby.'));
  assert.ok(!isCorrect('Libbys toy.', 'Libby’s toy.'));
  assert.ok(!isCorrect('I obey', 'I obey!'));
  assert.ok(!isCorrect('Calm and quiet.', 'Calm – and quiet.'));
  assert.ok(isCorrect('Ich gehöre Libby.', 'Ich gehöre Libby.'));
});
