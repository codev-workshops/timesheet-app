const jwt = require('jsonwebtoken');
const { getJwtSecret, jwtAlgorithm } = require('../config/auth');

// Bearer-token authentication. The caller's identity comes from a signed JWT issued by
// /api/auth/login, so it cannot be asserted by the client. Users are never created here.
function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (!token || scheme.toLowerCase() !== 'bearer') {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let payload;
  try {
    // Pinning the algorithm prevents algorithm-confusion attacks (e.g. alg: none).
    payload = jwt.verify(token, getJwtSecret(), { algorithms: [jwtAlgorithm] });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  if (!payload || typeof payload.sub !== 'string' || !payload.sub) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.userEmail = payload.sub;
  next();
}

module.exports = {
  authenticateUser
};
