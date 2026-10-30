const { getDatabase } = require('../database/init');
const { verifyToken } = require('../security/token');

/**
 * Authenticates the request from a signed Bearer token and sets
 * req.userEmail to the token's verified subject.
 */
function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let userEmail;
  try {
    userEmail = verifyToken(token);
  } catch (err) {
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

    req.userEmail = row.email;
    next();
  });
}

module.exports = {
  authenticateUser
};
