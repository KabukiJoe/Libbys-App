const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const distDir = path.join(__dirname, '..', 'frontend', 'dist');

app.use(express.json());

// Placeholder: will later forward the message to the chatbot.
app.post('/api/chat', (req, res) => {
  const { message } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }
  console.log('Received:', message);
  res.json({ ok: true });
});

// Serve the built React app (production).
app.use(express.static(distDir));

app.listen(port, () => console.log(`Listening on port ${port}`));
