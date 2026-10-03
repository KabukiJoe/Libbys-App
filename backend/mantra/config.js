module.exports = {
  timezone: process.env.MANTRA_TIMEZONE || 'Europe/Berlin',
  prompt: process.env.MANTRA_PROMPT || 'Send a mantra for Roger',
  planAt: { hour: 2, minute: 0 }, // when the day's mantras are planned
  windowStart: { hour: 8, minute: 0 }, // mantras are sent between these times
  windowEnd: { hour: 20, minute: 0 },
  minCount: 3,
  maxCount: 5,
  gapMs: 60 * 60 * 1000, // at least this far apart
  answerMs: 5 * 60 * 1000, // time to type the mantra
  maxTries: 3, // attempts to fetch a mantra from Kindroid before giving up on a slot
  keepMantras: 100,
};
