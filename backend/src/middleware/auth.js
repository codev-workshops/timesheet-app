const jwt = require('jsonwebtoken');
const { AUTH_COOKIE, getJwtSecret } = require('../config/auth');

function authenticateUser(req, res, next) {
  const token = req.cookies && req.cookies[AUTH_COOKIE];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (!payload || typeof payload.email !== 'string') {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }
    req.userEmail = payload.email;
    return next();
  } catch (err) {
    const error = err.name === 'TokenExpiredError'
      ? 'Authentication token expired'
      : 'Invalid authentication token';
    return res.status(401).json({ error });
  }
}

module.exports = {
  authenticateUser
};
