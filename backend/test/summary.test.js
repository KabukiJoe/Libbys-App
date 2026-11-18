const test = require('node:test');
const assert = require('node:assert');
const { DateTime } = require('luxon');
const { getReadySummaries } = require('../mantra/summary');

const timezone = 'Europe/Berlin';
const millis = (iso) => DateTime.fromISO(iso, { zone: timezone }).toMillis();
const stats = {
  daily: { success: 3, failed: 1 },
  weekly: { success: 12, failed: 2 },
};

function input(overrides = {}) {
  return {
    schedule: { date: '2026-06-21', slots: [{ status: 'done' }, { status: 'skipped' }] },
    mantras: [{ status: 'success' }],
    stats,
    summarySent: {},
    now: millis('2026-06-21T20:05'),
    timezone,
    ...overrides,
  };
}

test('daily and Sunday weekly summaries wait for all slots and open mantras to finish', () => {
  assert.deepStrictEqual(getReadySummaries(input({
    schedule: { date: '2026-06-21', slots: [{ status: 'pending' }] },
  })), []);
  assert.deepStrictEqual(getReadySummaries(input({
    mantras: [{ status: 'open' }],
  })), []);
});

test('sends count-only daily and weekly summaries on Sunday', () => {
  assert.deepStrictEqual(getReadySummaries(input()), [
    {
      type: 'daily',
      key: '2026-06-21',
      message: 'Daily mantra summary for 2026-06-21: 3 successful, 1 failed.',
    },
    {
      type: 'weekly',
      key: '2026-06-15',
      message: 'Weekly mantra summary for 2026-06-15 to 2026-06-21: 12 successful, 2 failed.',
    },
  ]);
});

test('does not resend summaries already recorded as sent', () => {
  const weeklyOnly = getReadySummaries(input({
    summarySent: { dailyDate: '2026-06-21' },
  }));
  assert.deepStrictEqual(weeklyOnly.map(({ type }) => type), ['weekly']);

  assert.deepStrictEqual(getReadySummaries(input({
    summarySent: { dailyDate: '2026-06-21', weeklyWeekStart: '2026-06-15' },
  })), []);
});

test('sends only an unsent daily summary on other days', () => {
  const result = getReadySummaries(input({
    schedule: { date: '2026-06-16', slots: [{ status: 'done' }] },
    now: millis('2026-06-16T20:05'),
    summarySent: { dailyDate: '2026-06-16' },
  }));
  assert.deepStrictEqual(result, []);

  const tuesday = getReadySummaries(input({
    schedule: { date: '2026-06-16', slots: [{ status: 'done' }] },
    now: millis('2026-06-16T20:05'),
  }));
  assert.strictEqual(tuesday.length, 1);
  assert.strictEqual(tuesday[0].type, 'daily');
});
