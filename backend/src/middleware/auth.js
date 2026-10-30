const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getDatabase } = require('../database/init');

const TOKEN_ALGORITHM = 'HS256';
const TOKEN_TTL = '24h';
const MIN_SECRET_LENGTH = 32;

function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) {
    if (secret.length < MIN_SECRET_LENGTH) {
      throw new Error(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
    }
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable is required in production');
  }
  if (process.env.NODE_ENV !== 'test') {
    console.warn('JWT_SECRET is not set; using a random per-process secret (sessions reset on restart)');
  }
  return crypto.randomBytes(48).toString('hex');
}

const jwtSecret = resolveJwtSecret();

function issueToken(email) {
  return jwt.sign({}, jwtSecret, {
    algorithm: TOKEN_ALGORITHM,
    subject: email,
    expiresIn: TOKEN_TTL
  });
}

function unauthorized(res) {
  return res.status(401).json({ error: 'Invalid or expired token' });
}

// Verifies the signed bearer token and derives req.userEmail from its subject.
function authenticateUser(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let email;
  try {
    email = jwt.verify(token, jwtSecret, { algorithms: [TOKEN_ALGORITHM] }).sub;
  } catch (err) {
    return unauthorized(res);
  }
  if (typeof email !== 'string' || !email) {
    return unauthorized(res);
  }

  const db = getDatabase();
  db.get('SELECT email FROM users WHERE email = ?', [email], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
    if (!row) {
      return unauthorized(res);
    }
    req.userEmail = row.email;
    next();
  });
}

module.exports = {
  authenticateUser,
  issueToken
};
