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

module.exports = {
  authenticateUser
};
