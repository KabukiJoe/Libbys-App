const HISTORY_KEY = 'history';
const MAX_ENTRIES = 20;

// Entries are stored newest first: { id, message, reply, at } with `at` in ms.
export function loadHistory() {
  try {
    const entries = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

export function addToHistory(message, reply) {
  const at = Date.now();
  const entry = { id: `${at}-${Math.random().toString(36).slice(2)}`, message, reply, at };
  const entries = [entry, ...loadHistory()].slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // Storage unavailable or full; history just isn't kept.
  }
  return entries;
}
