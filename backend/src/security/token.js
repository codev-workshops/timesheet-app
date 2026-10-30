const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const ALGORITHM = 'HS256';
const ISSUER = 'timesheet-app';
const MIN_SECRET_LENGTH = 32;

let cachedSecret = null;

/**
 * Returns the JWT signing secret from JWT_SECRET, or a random per-process
 * secret when it is unset (tokens then stop working after a restart).
 * @return {string}
 */
function getJwtSecret() {
  if (cachedSecret) {
    return cachedSecret;
  }
  const configured = process.env.JWT_SECRET;
  if (configured) {
    if (configured.length < MIN_SECRET_LENGTH) {
      throw new Error(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
    }
    cachedSecret = configured;
  } else {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('JWT_SECRET is not set; using a random secret, so sessions end on restart');
    }
    cachedSecret = crypto.randomBytes(48).toString('base64');
  }
  return cachedSecret;
}

/**
 * Signs a session token for a verified user.
 * @param {string} email
 * @return {string}
 */
function issueToken(email) {
  return jwt.sign({}, getJwtSecret(), {
    algorithm: ALGORITHM,
    issuer: ISSUER,
    audience: ISSUER,
    subject: email,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  });
}

/**
 * Verifies a session token and returns the user's email.
 * @param {string} token
 * @return {string}
 * @throws {Error} If the token is invalid, expired, or has no subject.
 */
function verifyToken(token) {
  const payload = jwt.verify(token, getJwtSecret(), {
    algorithms: [ALGORITHM],
    issuer: ISSUER,
    audience: ISSUER
  });
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('Token has no subject');
  }
  return payload.sub;
}

function resetJwtSecretForTests() {
  cachedSecret = null;
}

module.exports = {
  issueToken,
  verifyToken,
  resetJwtSecretForTests
};
