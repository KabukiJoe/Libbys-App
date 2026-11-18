// Pure gate logic for the keybox unlock approval flow. No I/O, no logging: the keyword is never
// returned to callers except through getKeyword, and never written anywhere by this module.

const NOTE_MAX = 500;
const KEYWORD_RE = /^[A-Za-z0-9_-]{6,}$/;
const DEFAULT_GRANT_MS = 120_000;
const MIN_GRANT_MS = 60_000;
const MAX_GRANT_MS = 180_000;
const REQUEST_TEXT = "[Keybox request] I'm asking you to open my keybox now.";

function getKeyword(env = process.env) {
  const raw = env.KEYBOX_UNLOCK_KEYWORD;
  if (typeof raw !== 'string') return null;
  const kw = raw.trim();
  if (!KEYWORD_RE.test(kw)) return null;
  return kw;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// The keyword counts only as a whole token: it must not touch letters, digits, '_' or '-' on either side.
function findApproval(reply, keyword) {
  const re = new RegExp(`(?<![A-Za-z0-9_-])${escapeRegExp(keyword)}(?![A-Za-z0-9_-])`, 'gi');
  const approved = re.test(reply);
  re.lastIndex = 0;
  const text = reply
    .replace(re, '')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { approved, text };
}

function grantWindowMs(env = process.env) {
  const raw = typeof env.KEYBOX_GRANT_SECONDS === 'string' ? env.KEYBOX_GRANT_SECONDS.trim() : '';
  if (!raw) return DEFAULT_GRANT_MS;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds)) return DEFAULT_GRANT_MS;
  return Math.min(MAX_GRANT_MS, Math.max(MIN_GRANT_MS, seconds * 1000));
}

function buildRequestMessage(note) {
  const reason = typeof note === 'string' ? note.trim().slice(0, NOTE_MAX).trim() : '';
  return reason ? `${REQUEST_TEXT}\n\nMy reason: ${reason}` : REQUEST_TEXT;
}

module.exports = { getKeyword, findApproval, grantWindowMs, buildRequestMessage, NOTE_MAX };
