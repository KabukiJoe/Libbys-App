const store = require('../store');
const { askKin } = require('../kindroid');
const config = require('./config');
const { planDay, localDay, formatLocal } = require('./plan');
const push = require('./push');

const TICK_MS = 30_000;
// A slot this late (e.g. the server was down) is skipped instead of firing a burst of mantras.
const MAX_LATE_MS = 15 * 60 * 1000;

let firing = false;

const isCorrect = (answer, text) => answer.trim() === text.trim();

function planIfDue(now) {
  const { date, pastPlanTime } = localDay(now, config);
  if (!pastPlanTime || store.load().schedule.date === date) return;

  const plan = planDay({ now, config });
  store.update((data) => {
    data.schedule = { date: plan.date, slots: plan.slots.map((at) => ({ at, status: 'pending', tries: 0 })) };
  });
  const times = plan.slots.map((at) => formatLocal(at, config)).join(', ');
  console.log(`Planned ${plan.slots.length} mantra(s) for ${plan.date}: ${times || '(none, window already over)'}`);
}

function expireOpen(now) {
  store.update((data) => {
    for (const mantra of data.mantras) {
      if (mantra.status === 'open' && mantra.deadline < now) {
        mantra.status = 'failed';
        mantra.reason = 'timeout';
        data.stats.failed++;
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
  await push.notifyAll({ title: 'Libby', body: 'You have a new Mantra', url: '/?open=mantra' });
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

async function tick() {
  if (firing) return;
  firing = true;
  try {
    const now = Date.now();
    planIfDue(now);
    expireOpen(now);
    await fireDueSlot(now);
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
  const { date } = localDay(now, config);
  const slots = data.schedule.date === date ? data.schedule.slots : [];

  return {
    now,
    open: open ? { id: open.id, text: open.text, deadline: open.deadline } : null,
    stats: data.stats,
    today: {
      planned: slots.length,
      remaining: slots.filter((slot) => slot.status === 'pending').length,
    },
  };
}

// One attempt per mantra. Returns null if the mantra doesn't exist, or { error } if it's already closed.
function answerMantra(id, answer) {
  const now = Date.now();
  return store.update((data) => {
    const mantra = data.mantras.find((m) => m.id === id);
    if (!mantra) return null;
    if (mantra.status !== 'open') return { error: 'Already answered or expired', status: mantra.status };

    const inTime = now <= mantra.deadline;
    const success = inTime && isCorrect(answer, mantra.text);
    mantra.status = success ? 'success' : 'failed';
    mantra.answer = answer;
    mantra.answeredAt = now;
    if (!success) mantra.reason = inTime ? 'typo' : 'timeout';
    data.stats[success ? 'success' : 'failed']++;

    return { result: mantra.status, reason: mantra.reason, expected: mantra.text, stats: data.stats };
  });
}

module.exports = { startScheduler, getStatus, answerMantra, requestMantra, isCorrect };
