import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { subscribePush } from '../../api.js';

export const pushSupported = () => Capacitor.isNativePlatform();

export async function pushPermission() {
  if (!pushSupported()) return 'unsupported';
  const { receive } = await PushNotifications.checkPermissions();
  return receive === 'prompt-with-rationale' ? 'prompt' : receive;
}

// Asks for permission if needed, then registers with FCM. The token reaches the server via the `registration` listener.
export async function enablePush() {
  const { receive } = await PushNotifications.requestPermissions();
  if (receive !== 'granted') throw new Error('Notifications were not allowed');
  await PushNotifications.register();
}

// If notifications are already allowed, register again so the server knows this device (the token can change).
export async function syncPush() {
  if ((await pushPermission()) === 'granted') await PushNotifications.register();
}

let initialized = false;

// Call once at app startup so a tap that cold-starts the app is not missed.
export function initPush({ onOpenMantra, onMantraReceived }) {
  if (!pushSupported() || initialized) return;
  initialized = true;

  PushNotifications.createChannel({ id: 'mantra', name: 'Mantras', importance: 5 }).catch(console.error);

  PushNotifications.addListener('registration', (token) => {
    subscribePush(token.value).catch((err) => console.error('Push subscribe failed:', err));
  });
  PushNotifications.addListener('registrationError', (err) => console.error('Push registration failed:', err));
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    if (action.notification.data?.open === 'mantra') onOpenMantra();
  });
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    if (notification.data?.open === 'mantra') onMantraReceived();
  });
}
