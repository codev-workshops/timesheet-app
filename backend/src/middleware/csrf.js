// SameSite=Strict auth cookies are the primary CSRF defense; the double-submit
// token is defense-in-depth for browsers that do not honor SameSite.
const crypto = require('crypto');
const { CSRF_COOKIE, CSRF_HEADER } = require('../config/auth');

function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  if (
    req.path === '/auth/login' ||
    req.path === '/auth/logout' ||
    req.originalUrl.startsWith('/api/auth/login') ||
    req.originalUrl.startsWith('/api/auth/logout')
  ) {
    return next();
  }

  const cookieToken = req.cookies && req.cookies[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);
  if (!cookieToken || !headerToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  const cookieBuffer = Buffer.from(cookieToken);
  const headerBuffer = Buffer.from(headerToken);
  if (
    cookieBuffer.length !== headerBuffer.length ||
    !crypto.timingSafeEqual(cookieBuffer, headerBuffer)
  ) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  return next();
}

module.exports = { csrfProtection };
