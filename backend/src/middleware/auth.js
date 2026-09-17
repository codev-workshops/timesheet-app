const { getDatabase } = require('../database/init');
const { verifyToken } = require('../config/jwt');

// Bearer-token authentication: the token is issued by POST /api/auth/login
function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const userEmail = payload.sub;
  if (typeof userEmail !== 'string' || !userEmail) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const db = getDatabase();

  db.get('SELECT email FROM users WHERE email = ?', [userEmail], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (!row) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.userEmail = userEmail;
    next();
  });
}

module.exports = {
  authenticateUser
};
