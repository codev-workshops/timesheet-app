const jwt = require('jsonwebtoken');

const MIN_SECRET_LENGTH = 32;

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= MIN_SECRET_LENGTH) {
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`JWT_SECRET must be set and at least ${MIN_SECRET_LENGTH} characters in production`);
  }
  if (!getSecret.warned) {
    console.warn('JWT_SECRET is not set (or too short); using an insecure development-only secret');
    getSecret.warned = true;
  }
  return 'insecure-development-secret-do-not-use-in-production';
}

function signToken(email) {
  return jwt.sign({ sub: email }, getSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    algorithm: 'HS256'
  });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret(), { algorithms: ['HS256'] });
}

function assertJwtConfig() {
  getSecret();
}

module.exports = { signToken, verifyToken, assertJwtConfig };
