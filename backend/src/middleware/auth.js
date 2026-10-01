const jwt = require('jsonwebtoken');
const { getDatabase } = require('../database/init');

const JWT_ALGORITHM = 'HS256';
const JWT_EXPIRES_IN = '24h';

function signToken(email) {
  return jwt.sign({ email }, process.env.JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: JWT_EXPIRES_IN
  });
}

function extractBearerToken(header) {
  if (typeof header !== 'string') {
    return null;
  }
  const match = /^Bearer ([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header with Bearer token required' });
  }

  const token = extractBearerToken(authHeader);
  if (!token) {
    return res.status(401).json({ error: 'Malformed Authorization header' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (!payload || typeof payload.email !== 'string') {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const db = getDatabase();

  db.get('SELECT email FROM users WHERE email = ?', [payload.email], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (!row) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.userEmail = row.email;
    next();
  });
}

module.exports = {
  authenticateUser,
  signToken
};
