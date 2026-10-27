const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getDatabase } = require('../database/init');

let generatedJwtSecret;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set to at least 32 characters in production');
  }

  if (!generatedJwtSecret) {
    generatedJwtSecret = crypto.randomBytes(48).toString('hex');
    console.warn('JWT_SECRET is not configured; authentication tokens will not survive restarts.');
  }
  return generatedJwtSecret;
}

function assertJwtConfig() {
  getJwtSecret();
}

function issueToken(email) {
  return jwt.sign({}, getJwtSecret(), {
    subject: email,
    algorithm: 'HS256',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    issuer: 'timesheet-app',
    audience: 'timesheet-app'
  });
}

function authenticateUser(req, res, next) {
  const authorization = req.headers.authorization;
  const match = typeof authorization === 'string'
    ? authorization.trim().match(/^Bearer\s+(\S+)$/i)
    : null;
  if (!match) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let payload;
  try {
    payload = jwt.verify(match[1], getJwtSecret(), {
      algorithms: ['HS256'],
      issuer: 'timesheet-app',
      audience: 'timesheet-app'
    });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  if (!payload || typeof payload.sub !== 'string' || !payload.sub) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const db = getDatabase();
    db.get('SELECT email FROM users WHERE email = ?', [payload.sub], (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!row) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      req.userEmail = row.email;
      next();
    });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  authenticateUser,
  issueToken,
  getJwtSecret,
  assertJwtConfig
};
