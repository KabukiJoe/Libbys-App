const { DateTime } = require('luxon');

// `count` random times in [start, end] (ms), sorted, each at least `gapMs` apart.
// Picks sorted offsets in the shortened range, then spreads them by i * gap.
function planSlots({ count, start, end, gapMs, rand = Math.random }) {
  const free = end - start - (count - 1) * gapMs;
  if (count <= 0 || free < 0) return [];
  const offsets = Array.from({ length: count }, () => Math.floor(rand() * free)).sort((a, b) => a - b);
  return offsets.map((offset, i) => start + offset + i * gapMs);
}

// Plans the mantras for the day `now` falls on (in the configured timezone).
// If planning happens late (e.g. the server was down at 02:00), only the rest of the window is used.
function planDay({ now, config, rand = Math.random }) {
  const local = DateTime.fromMillis(now, { zone: config.timezone });
  const at = (time) => local.set({ ...time, second: 0, millisecond: 0 }).toMillis();

  const start = Math.max(at(config.windowStart), now);
  const end = at(config.windowEnd);

  const wanted = config.minCount + Math.floor(rand() * (config.maxCount - config.minCount + 1));
  const fits = end >= start ? Math.floor((end - start) / config.gapMs) + 1 : 0;
  const count = Math.min(wanted, fits);

  return {
    date: local.toISODate(),
    slots: planSlots({ count, start, end, gapMs: config.gapMs, rand }),
  };
}

// Today's date and whether it's past the daily planning time, in the configured timezone.
function localDay(now, config) {
  const local = DateTime.fromMillis(now, { zone: config.timezone });
  const planTime = local.set({ ...config.planAt, second: 0, millisecond: 0 });
  return { date: local.toISODate(), pastPlanTime: local >= planTime };
}

const formatLocal = (ms, config) =>
  DateTime.fromMillis(ms, { zone: config.timezone }).toFormat('HH:mm');

module.exports = { planSlots, planDay, localDay, formatLocal };
