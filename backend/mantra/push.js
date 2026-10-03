const webpush = require('web-push');
const store = require('../store');

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
const enabled = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);

if (enabled) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn('Push notifications disabled (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT missing)');
}

function addSubscription(subscription) {
  store.update((data) => {
    data.pushSubscriptions = data.pushSubscriptions.filter((s) => s.endpoint !== subscription.endpoint);
    data.pushSubscriptions.push(subscription);
  });
}

// Sends to every subscribed device; drops subscriptions the push service says are gone.
async function notifyAll(payload) {
  if (!enabled) return;
  const subscriptions = store.load().pushSubscriptions;
  const gone = [];

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        // TTL: a mantra notification is useless after the answer time is over.
        await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 300, urgency: 'high' });
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) gone.push(subscription.endpoint);
        else console.error('Push failed:', err.statusCode || '', err.message);
      }
    }),
  );

  if (gone.length) {
    store.update((data) => {
      data.pushSubscriptions = data.pushSubscriptions.filter((s) => !gone.includes(s.endpoint));
    });
  }
  console.log(`Push sent to ${subscriptions.length - gone.length} device(s)`);
}

module.exports = { enabled, publicKey: VAPID_PUBLIC_KEY, addSubscription, notifyAll };
