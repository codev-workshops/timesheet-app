const jwt = require('jsonwebtoken');
const { getDatabase } = require('../database/init');

const JWT_SECRET = process.env.JWT_SECRET || 'timesheet-dev-secret-change-in-production';
const TOKEN_TTL = '24h';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(email) {
  return jwt.sign({ email }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

// JWT bearer authentication middleware
function authenticateUser(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({ error: 'Authorization Bearer token required' });
  }

  let payload;
  try {
    payload = jwt.verify(match[1], JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const userEmail = payload && payload.email;
  if (typeof userEmail !== 'string' || !EMAIL_REGEX.test(userEmail)) {
    return res.status(401).json({ error: 'Invalid token payload' });
  }

  const db = getDatabase();

  // Create the user if missing (e.g. fresh database) without a SELECT/INSERT race
  db.run('INSERT OR IGNORE INTO users (email) VALUES (?)', [userEmail], (err) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    req.userEmail = userEmail;
    next();
  });
}

module.exports = {
  authenticateUser,
  signToken,
  JWT_SECRET
};
