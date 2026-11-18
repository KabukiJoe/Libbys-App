const { DateTime } = require('luxon');

function ensureStats(data, now, timezone) {
  const local = DateTime.fromMillis(now, { zone: timezone });
  const date = local.toISODate();
  const weekStart = local.startOf('week').toISODate();
  const previous = data.stats || {};

  data.stats = {
    daily: previous.daily?.date === date
      ? previous.daily
      : { date, success: 0, failed: 0 },
    weekly: previous.weekly?.weekStart === weekStart
      ? previous.weekly
      : { weekStart, success: 0, failed: 0 },
  };
  return data.stats;
}

function recordResult(stats, success) {
  const key = success ? 'success' : 'failed';
  stats.daily[key]++;
  stats.weekly[key]++;
}

function publicStats(stats) {
  const counts = ({ success, failed }) => ({ success, failed });
  return { daily: counts(stats.daily), weekly: counts(stats.weekly) };
}

module.exports = { ensureStats, recordResult, publicStats };
