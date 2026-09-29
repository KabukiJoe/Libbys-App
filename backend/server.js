const express = require('express');
const path = require('path');
const { requirePassword } = require('./auth');
const { sendToGroup } = require('./kindroid');

const app = express();
const port = process.env.PORT || 3000;
const distDir = path.join(__dirname, '..', 'frontend', 'dist');

app.use(express.json());
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
    const reply = await sendToGroup(message);
    res.json({ reply });
  } catch (err) {
    console.error('Chat failed:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// Serve the built React app (production).
app.use(express.static(distDir));

app.listen(port, () => console.log(`Listening on port ${port}`));
