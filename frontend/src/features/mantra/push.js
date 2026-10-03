import { getPushPublicKey, subscribePush } from '../../api.js';

export const pushSupported = () =>
  window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const pushPermission = () => (pushSupported() ? Notification.permission : 'unsupported');

function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

// Subscribes this device and registers it with the server. Asks for permission if needed.
export async function enablePush() {
  if (!pushSupported()) throw new Error('Notifications are not supported here');
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications were not allowed');

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const { publicKey } = await getPushPublicKey();
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  await subscribePush(subscription.toJSON());
}

// If notifications are already allowed, make sure the server knows this device (e.g. after a data reset).
export async function syncPush() {
  if (pushPermission() !== 'granted') return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) await subscribePush(subscription.toJSON());
  else await enablePush();
}
