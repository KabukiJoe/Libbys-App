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

router.post('/push/subscribe', (req, res) => {
  const { token } = req.body || {};
  if (typeof token !== 'string' || !token) return res.status(400).json({ error: 'token is required' });
  push.addToken(token);
  res.json({ ok: true });
});

module.exports = router;
