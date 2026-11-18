const store = require('../store');
const { askKin, sendKinMessage } = require('../kindroid');
const config = require('./config');
const { planDay, localDay, formatLocal } = require('./plan');
const { ensureStats, recordResult, publicStats } = require('./stats');
const { getReadySummaries } = require('./summary');
const push = require('./push');

const TICK_MS = 30_000;
// A slot this late (e.g. the server was down) is skipped instead of firing a burst of mantras.
const MAX_LATE_MS = 15 * 60 * 1000;

let firing = false;
const sendingSummaries = new Set();

// Makes characters that are hard to type on a phone keyboard compare equal to their plain versions.
// Case, letters and punctuation stay strict.
function normalizeMantra(value) {
  return value
    .normalize('NFC')
    .replace(/[‘’‚‛´`ʼ′]/g, "'")
    .replace(/[“”„‟«»″]/g, '"')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}️​-‍⁠﻿]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const isCorrect = (answer, text) => normalizeMantra(answer) === normalizeMantra(text);

function planIfDue(now) {
  const { date, pastPlanTime } = localDay(now, config);
  if (!pastPlanTime || store.load().schedule.date === date) return;

  const plan = planDay({ now, config });
  store.update((data) => {
    data.schedule = { date: plan.date, slots: plan.slots.map((at) => ({ at, status: 'pending', tries: 0 })) };
  });
  // The schedule stays secret, also in the logs, unless MANTRA_LOG_SCHEDULE=true (for debugging).
  if (process.env.MANTRA_LOG_SCHEDULE === 'true') {
    const times = plan.slots.map((at) => formatLocal(at, config)).join(', ');
    console.log(`Planned ${plan.slots.length} mantra(s) for ${plan.date}: ${times || '(none)'}`);
  } else {
    console.log(`Planned today's mantras (${plan.date})`);
  }
}

function expireOpen(now) {
  store.update((data) => {
    const stats = ensureStats(data, now, config.timezone);
    for (const mantra of data.mantras) {
      if (mantra.status === 'open' && mantra.deadline < now) {
        mantra.status = 'failed';
        mantra.reason = 'timeout';
        recordResult(stats, false);
      }
    }
  });
}

// Requests a mantra from Kindroid, stores it with a deadline and notifies the phone.
async function requestMantra() {
  const text = await askKin({ groupId: process.env.KINDROID_MANTRA_GROUP_ID, message: config.prompt });
  const now = Date.now();
  const mantra = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    receivedAt: now,
    deadline: now + config.answerMs,
    status: 'open',
  };
  store.update((data) => {
    data.mantras.push(mantra);
    data.mantras = data.mantras.slice(-config.keepMantras);
  });
  console.log(`New mantra ${mantra.id}, due by ${formatLocal(mantra.deadline, config)}`);
  await push.notifyAll({ title: 'Memo', body: 'You have a new notification' });
  return mantra;
}

async function fireDueSlot(now) {
  const slots = store.load().schedule.slots;
  const index = slots.findIndex((slot) => slot.status === 'pending' && slot.at <= now);
  if (index < 0) return;

  if (now - slots[index].at > MAX_LATE_MS) {
    store.update((data) => {
      data.schedule.slots[index].status = 'skipped';
    });
    console.warn(`Skipped mantra slot ${formatLocal(slots[index].at, config)} (too late)`);
    return;
  }

  try {
    await requestMantra();
    store.update((data) => {
      data.schedule.slots[index].status = 'done';
    });
  } catch (err) {
    const tries = store.update((data) => {
      const slot = data.schedule.slots[index];
      slot.tries++;
      if (slot.tries >= config.maxTries) slot.status = 'error';
      return slot.tries;
    });
    console.error(`Mantra request failed (try ${tries}/${config.maxTries}):`, err.message);
  }
}

async function sendReadySummaries(now) {
  const data = store.load();
  const ready = getReadySummaries({
    schedule: data.schedule,
    mantras: data.mantras,
    stats: data.stats,
    summarySent: data.summarySent,
    now,
    timezone: config.timezone,
  });

  for (const summary of ready) {
    const lock = `${summary.type}:${summary.key}`;
    if (sendingSummaries.has(lock)) continue;
    sendingSummaries.add(lock);
    try {
      await sendKinMessage({ message: summary.message });
      store.update((current) => {
        if (summary.type === 'daily') current.summarySent.dailyDate = summary.key;
        else current.summarySent.weeklyWeekStart = summary.key;
      });
      console.log(`Sent ${summary.type} mantra summary for ${summary.key}`);
    } catch (err) {
      console.error(`Could not send ${summary.type} mantra summary for ${summary.key}:`, err.message);
      break;
    } finally {
      sendingSummaries.delete(lock);
    }
  }
}

async function tick() {
  if (firing) return;
  firing = true;
  try {
    const now = Date.now();
    planIfDue(now);
    expireOpen(now);
    await fireDueSlot(now);
    await sendReadySummaries(now);
  } catch (err) {
    console.error('Mantra scheduler error:', err);
  } finally {
    firing = false;
  }
}

function startScheduler() {
  if (!process.env.KINDROID_MANTRA_GROUP_ID) {
    console.warn('Mantra scheduler disabled (KINDROID_MANTRA_GROUP_ID missing)');
    return;
  }
  tick();
  setInterval(tick, TICK_MS);
}

function getStatus() {
  const now = Date.now();
  expireOpen(now);
  const data = store.load();
  const open = data.mantras.find((m) => m.status === 'open');

  // Deliberately nothing about today's schedule: when and how many mantras come must stay a surprise.
  return {
    now,
    open: open ? { id: open.id, text: open.text, deadline: open.deadline } : null,
    stats: publicStats(data.stats),
  };
}

// One attempt per mantra. Returns null if the mantra doesn't exist, or { error } if it's already closed.
function answerMantra(id, answer) {
  const now = Date.now();
  return store.update((data) => {
    const mantra = data.mantras.find((m) => m.id === id);
    if (!mantra) return null;
    if (mantra.status !== 'open') return { error: 'Already answered or expired', status: mantra.status };

    const stats = ensureStats(data, now, config.timezone);
    const inTime = now <= mantra.deadline;
    const success = inTime && isCorrect(answer, mantra.text);
    mantra.status = success ? 'success' : 'failed';
    mantra.answer = answer;
    mantra.answeredAt = now;
    if (!success) mantra.reason = inTime ? 'typo' : 'timeout';
    recordResult(stats, success);

    return { result: mantra.status, reason: mantra.reason, expected: mantra.text, stats: publicStats(stats) };
  });
}

module.exports = { startScheduler, getStatus, answerMantra, requestMantra, isCorrect };
