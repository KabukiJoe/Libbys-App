const express = require('express');
const { getStatus, answerMantra, requestMantra } = require('./index');
const push = require('./push');

const router = express.Router();

router.get('/mantra', (req, res) => {
  res.json(getStatus());
});

router.post('/mantra/:id/answer', (req, res) => {
  const { answer } = req.body || {};
  if (typeof answer !== 'string') return res.status(400).json({ error: 'answer is required' });

  const result = answerMantra(req.params.id, answer);
  if (!result) return res.status(404).json({ error: 'Mantra not found' });
  if (result.error) return res.status(409).json(result);
  res.json(result);
});

// Requests a mantra right now, for testing. Not used by the UI.
router.post('/mantra/trigger', async (req, res) => {
  try {
    const mantra = await requestMantra();
    res.json({ id: mantra.id, deadline: mantra.deadline });
  } catch (err) {
    console.error('Manual mantra trigger failed:', err.message);
    res.status(502).json({ error: err.message });
  }
});

router.get('/push/public-key', (req, res) => {
  if (!push.enabled) return res.status(503).json({ error: 'Push notifications are not configured' });
  res.json({ publicKey: push.publicKey });
});

router.post('/push/subscribe', (req, res) => {
  const { subscription } = req.body || {};
  if (!subscription?.endpoint) return res.status(400).json({ error: 'subscription is required' });
  push.addSubscription(subscription);
  res.json({ ok: true });
});

module.exports = router;
