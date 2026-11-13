import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { subscribePush } from '../../api.js';

export const pushSupported = () => Capacitor.isNativePlatform();

export async function pushPermission() {
  if (!pushSupported()) return 'unsupported';
  const { receive } = await PushNotifications.checkPermissions();
  return receive === 'prompt-with-rationale' ? 'prompt' : receive;
}

const REGISTER_TIMEOUT_MS = 20_000;

// The enablePush call currently waiting for the registration outcome, if any.
let pending = null;

// Outcome of a registration (token sent to the server, or an error): settles enablePush, else goes to onBackgroundError.
let onBackgroundError = (err) => console.error('Push registration failed:', err);

function settle(err) {
  if (!pending) {
    if (err) onBackgroundError(err);
    return;
  }
  const { resolve, reject, timer } = pending;
  pending = null;
  clearTimeout(timer);
  if (err) reject(err);
  else resolve();
}

// Asks for permission if needed, registers with FCM and sends the token to the server.
// Rejects if permission is denied, FCM registration fails or the server rejects the token.
export async function enablePush() {
  const { receive } = await PushNotifications.requestPermissions();
  if (receive !== 'granted') throw new Error('Notifications were not allowed');

  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => settle(new Error('Notification setup timed out')), REGISTER_TIMEOUT_MS);
    pending = { resolve, reject, timer };
  });
  try {
    await PushNotifications.register();
  } catch (err) {
    settle(err);
  }
  return done;
}

// If notifications are already allowed, register again so the server knows this device (the token can change).
export async function syncPush() {
  if ((await pushPermission()) === 'granted') await PushNotifications.register();
}

let initialized = false;

// Call once at app startup so a tap that cold-starts the app is not missed.
export function initPush({ onOpenMantra, onMantraReceived, onError }) {
  if (!pushSupported() || initialized) return;
  initialized = true;
  if (onError) onBackgroundError = onError;

  PushNotifications.createChannel({ id: 'mantra', name: 'Mantras', importance: 5 }).catch(console.error);

  PushNotifications.addListener('registration', (token) => {
    subscribePush(token.value).then(() => settle(), settle);
  });
  PushNotifications.addListener('registrationError', (err) => settle(new Error(err.error || 'Push registration failed')));
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    if (action.notification.data?.open === 'mantra') onOpenMantra();
  });
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    if (notification.data?.open === 'mantra') onMantraReceived();
  });
}
