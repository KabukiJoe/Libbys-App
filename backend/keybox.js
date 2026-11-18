const express = require('express');
const store = require('./store');
const gate = require('./keyboxGate');
const { askKinDirect } = require('./kindroid');

// Backup of the keybox's lock data (the PC tool's lockData.json entry), so losing the phone does not lose
// the box. The same shape the app validates in frontend/src/features/keybox/lockDataStore.js.
// There is NO plain read route: the lock is returned only by POST /keybox/credentials, and only during an
// open window that Libby (the Kindroid) approved by saying the secret keyword. The keyword and the lock
// are never logged or echoed; errors are fixed strings.

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function isValidLock(lock) {
  if (!isObject(lock)) return false;
  if (typeof lock.address !== 'string' || !lock.address) return false;
  const priv = lock.privateData;
  if (!isObject(priv) || typeof priv.aesKey !== 'string' || !/^[0-9a-fA-F]{32}$/.test(priv.aesKey)) return false;
  const unlockKey = isObject(priv.admin) ? priv.admin.unlockKey : undefined;
  return Number.isInteger(unlockKey) && unlockKey >= 0;
}

function createKeyboxRouter({ askKin = askKinDirect, now = Date.now, env = process.env } = {}) {
  const router = express.Router();

  const grantState = () => {
    const expiresAt = store.load().keybox?.grant?.expiresAt;
    const left = typeof expiresAt === 'number' ? expiresAt - now() : 0;
    return left > 0 ? { active: true, expiresInMs: left } : { active: false, expiresInMs: 0 };
  };

  const cooldownState = () => {
    const until = store.load().keybox?.cooldownUntil;
    const left = typeof until === 'number' ? Math.ceil(until - now()) : 0;
    return left > 0 ? { active: true, retryInMs: left } : { active: false, retryInMs: 0 };
  };

  // Everything except the lock-data backup fails closed without a valid keyword.
  const needGate = (req, res, next) => {
    const keyword = gate.getKeyword(env);
    if (!keyword) return res.status(503).json({ error: 'Keybox gate is not configured' });
    req.keyword = keyword;
    next();
  };

  router.get('/keybox/status', needGate, (req, res) => {
    res.json({ hasLock: Boolean(store.load().keybox?.lockData), grant: grantState(), cooldown: cooldownState() });
  });

  router.post('/keybox/request', needGate, async (req, res) => {
    const note = (req.body || {}).note;
    if (note !== undefined && note !== null) {
      if (typeof note !== 'string' || note.length > gate.NOTE_MAX || note.toLowerCase().includes(req.keyword.toLowerCase())) {
        return res.status(400).json({ error: 'Note not allowed' });
      }
    }
    const current = grantState();
    if (current.active) return res.json({ approved: true, reply: '', grant: current });
    const cooling = cooldownState();
    if (cooling.active) {
      return res.status(429).json({ error: 'Please wait before asking again', retryInMs: cooling.retryInMs });
    }
    let raw;
    try {
      raw = await askKin({ message: gate.buildRequestMessage(note || undefined) });
    } catch (err) {
      return res.status(502).json({ error: err.message });
    }
    const { approved, text } = gate.findApproval(String(raw), req.keyword);
    if (approved) {
      const expiresAt = now() + gate.grantWindowMs(env);
      store.update((data) => {
        const { cooldownUntil, ...rest } = data.keybox || {};
        data.keybox = { ...rest, grant: { expiresAt } };
      });
    } else {
      const cooldownUntil = now() + gate.COOLDOWN_MS;
      store.update((data) => {
        data.keybox = { ...data.keybox, cooldownUntil };
      });
    }
    res.json({ approved, reply: text, grant: grantState(), cooldown: cooldownState() });
  });

  router.post('/keybox/credentials', needGate, (req, res) => {
    if (!grantState().active) return res.status(403).json({ error: 'Not approved' });
    const lockData = store.load().keybox?.lockData;
    if (!lockData) return res.status(404).json({ error: 'No lock data' });
    res.json({ lockData });
  });

  router.post('/keybox/grant/end', needGate, (req, res) => {
    store.update((data) => {
      if (data.keybox) delete data.keybox.grant;
    });
    res.json({ ok: true });
  });

  router.post('/keybox/lock-data', (req, res) => {
    const { lockData } = req.body || {};
    // Fixed message on purpose: never echo the submitted key material.
    if (!isValidLock(lockData)) return res.status(400).json({ error: 'Invalid lock data' });
    store.update((data) => {
      data.keybox = { ...data.keybox, lockData };
    });
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createKeyboxRouter };
