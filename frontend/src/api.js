const PASSWORD_KEY = 'appPassword';

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
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${password}`,
      ...options.headers,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new UnauthorizedError(data.error || 'Wrong password');
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
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

export function getPushPublicKey() {
  return request('/api/push/public-key');
}

export function subscribePush(subscription) {
  return request('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ subscription }),
  });
}
