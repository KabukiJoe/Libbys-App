const express = require('express');
const store = require('./store');

// Write-only backup of the keybox's lock data (the PC tool's lockData.json entry), so losing the phone does
// not lose the box. The same shape the app validates in frontend/src/features/keybox/lockDataStore.js.
// There is deliberately NO read route: getting the lock back means reading data.json on the server volume
// (key `keybox.lockData`) by hand, so the app password alone never yields the keys.

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function isValidLock(lock) {
  if (!isObject(lock)) return false;
  if (typeof lock.address !== 'string' || !lock.address) return false;
  const priv = lock.privateData;
  if (!isObject(priv) || typeof priv.aesKey !== 'string' || !/^[0-9a-fA-F]{32}$/.test(priv.aesKey)) return false;
  const unlockKey = isObject(priv.admin) ? priv.admin.unlockKey : undefined;
  return Number.isInteger(unlockKey) && unlockKey >= 0;
}

const router = express.Router();

router.post('/keybox/lock-data', (req, res) => {
  const { lockData } = req.body || {};
  // Fixed message on purpose: never echo the submitted key material.
  if (!isValidLock(lockData)) return res.status(400).json({ error: 'Invalid lock data' });
  store.update((data) => {
    data.keybox = { lockData };
  });
  res.json({ ok: true });
});

module.exports = router;
