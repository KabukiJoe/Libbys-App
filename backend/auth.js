const crypto = require('crypto');

const hash = (value) => crypto.createHash('sha256').update(value).digest();

// Requires `Authorization: Bearer <APP_PASSWORD>`. Fails closed if no password is configured.
function requirePassword(req, res, next) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    console.error('APP_PASSWORD is not set; rejecting API request');
    return res.status(500).json({ error: 'Server not configured' });
  }

  const header = req.get('Authorization') || '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!crypto.timingSafeEqual(hash(given), hash(password))) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  next();
}

module.exports = { requirePassword };
