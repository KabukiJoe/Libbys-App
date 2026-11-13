const express = require('express');
const cors = require('cors');
const { requirePassword } = require('./auth');
const { askKin } = require('./kindroid');
const mantraRoutes = require('./mantra/routes');

// The native app's WebView origin (Capacitor, androidScheme https).
// Must be an array: a plain string makes `cors` send the header to every origin.
const APP_ORIGINS = ['https://localhost'];

function createApp() {
  const app = express();

  app.use(express.json());
  // CORS first so preflight (no Authorization header) is answered before the password check.
  app.use(
    '/api',
    cors({
      origin: APP_ORIGINS,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );
  app.use('/api', requirePassword);

  app.get('/api/auth-check', (req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/chat', async (req, res) => {
    const { message } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }
    try {
      const reply = await askKin({ groupId: process.env.KINDROID_GROUP_ID, message });
      res.json({ reply });
    } catch (err) {
      console.error('Chat failed:', err.message);
      res.status(502).json({ error: err.message });
    }
  });

  app.use('/api', mantraRoutes);

  return app;
}

module.exports = { createApp };
