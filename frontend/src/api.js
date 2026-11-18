const PASSWORD_KEY = 'appPassword';

// Empty in browser dev (Vite proxies relative /api); set to the Railway URL for native builds.
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export class UnauthorizedError extends Error {}

export function getStoredPassword() {
  try {
    return localStorage.getItem(PASSWORD_KEY) || '';
  } catch {
    return '';
  }
}

export function storePassword(password) {
  try {
    if (password) localStorage.setItem(PASSWORD_KEY, password);
    else localStorage.removeItem(PASSWORD_KEY);
  } catch {
    // Storage unavailable; the password just won't be remembered.
  }
}

async function request(path, { password = getStoredPassword(), ...options } = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${password}`,
      ...options.headers,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new UnauthorizedError(data.error || 'Wrong password');
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function checkPassword(password) {
  return request('/api/auth-check', { password });
}

export function sendMessage(message) {
  return request('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export function getMantra() {
  return request('/api/mantra');
}

export function answerMantra(id, answer) {
  return request(`/api/mantra/${encodeURIComponent(id)}/answer`, {
    method: 'POST',
    body: JSON.stringify({ answer }),
  });
}

// Write-only backup of the keybox lock data on the server (see backend/keybox.js); there is no read route.
export function backupKeyboxLockData(lockData) {
  return request('/api/keybox/lock-data', {
    method: 'POST',
    body: JSON.stringify({ lockData }),
  });
}

export function getKeyboxStatus() {
  return request('/api/keybox/status');
}

export function requestKeyboxOpen(note) {
  const trimmed = typeof note === 'string' ? note.trim() : '';
  return request('/api/keybox/request', {
    method: 'POST',
    body: JSON.stringify(trimmed ? { note: trimmed } : {}),
  });
}

// Only succeeds while the Libby-approved window is open; the lock data is used once and never stored.
export function fetchKeyboxCredentials() {
  return request('/api/keybox/credentials', { method: 'POST', body: JSON.stringify({}) });
}

export function endKeyboxGrant() {
  return request('/api/keybox/grant/end', { method: 'POST', body: JSON.stringify({}) });
}

export function subscribePush(token) {
  return request('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}
