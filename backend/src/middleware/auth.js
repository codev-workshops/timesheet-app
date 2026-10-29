const { db } = require('../database/db');

// Simple email-based authentication middleware
async function authenticateUser(req, res, next) {
  const userEmail = req.headers['x-user-email'];

  if (!userEmail) {
    return res.status(401).json({ error: 'User email required in x-user-email header' });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(userEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Check if user exists, create if not
  let row;
  try {
    row = await db('users').select('email').where({ email: userEmail }).first();
  } catch (err) {
    console.error('Database error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  if (!row) {
    try {
      await db('users').insert({ email: userEmail });
    } catch (err) {
      console.error('Error creating user:', err);
      return res.status(500).json({ error: 'Failed to create user' });
    }
  }

  req.userEmail = userEmail;
  next();
}

// ADMIN_EMAILS is a comma-separated allowlist, read on every call so it can change at runtime.
function isAdminEmail(email) {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(String(email).trim().toLowerCase());
}

// Must run after authenticateUser.
function requireAdmin(req, res, next) {
  if (!isAdminEmail(req.userEmail)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = {
  authenticateUser,
  requireAdmin,
  isAdminEmail
};
