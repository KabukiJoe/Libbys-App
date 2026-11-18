const express = require('express');
const store = require('./store');

// Backup of the keybox's lock data (the PC tool's lockData.json entry), so losing the phone does not lose
// the box. The same shape the app validates in frontend/src/features/keybox/lockDataStore.js.
// NOTE: anyone with the app password can read it back; the Libby gate (step 2) is meant to wrap GET.

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

router.get('/keybox/lock-data', (req, res) => {
  const lockData = store.load().keybox?.lockData;
  if (!lockData) return res.status(404).json({ error: 'No lock data backed up on the server' });
  res.json({ lockData });
});

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
