const { DateTime } = require('luxon');

const TERMINAL_SLOT_STATUSES = new Set(['done', 'skipped', 'error']);

function getReadySummaries({ schedule, mantras, stats, summarySent, now, timezone }) {
  const local = DateTime.fromMillis(now, { zone: timezone });
  const date = local.toISODate();
  if (
    schedule.date !== date ||
    schedule.slots.some((slot) => !TERMINAL_SLOT_STATUSES.has(slot.status)) ||
    mantras.some((mantra) => mantra.status === 'open')
  ) {
    return [];
  }

  const sent = summarySent || {};
  const ready = [];
  if (sent.dailyDate !== date) {
    ready.push({
      type: 'daily',
      key: date,
      message: `Automated daily mantra summary for ${date}: ${stats.daily.success} successful, ${stats.daily.failed} failed.`,
    });
  }

  const weekStart = local.startOf('week').toISODate();
  if (local.weekday === 7 && sent.weeklyWeekStart !== weekStart) {
    ready.push({
      type: 'weekly',
      key: weekStart,
      message: `Automated weekly mantra summary for ${weekStart} to ${date}: ${stats.weekly.success} successful, ${stats.weekly.failed} failed.`,
    });
  }
  return ready;
}

module.exports = { getReadySummaries };
