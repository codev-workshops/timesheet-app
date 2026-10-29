const express = require('express');
const { db } = require('../database/db');
const { emailSchema } = require('../validation/schemas');
const { authenticateUser, isAdminEmail } = require('../middleware/auth');

const router = express.Router();

// Login endpoint - creates user if doesn't exist
router.post('/login', async (req, res, next) => {
  try {
    const { error, value } = emailSchema.validate(req.body);
    if (error) {
      return next(error);
    }

    const { email } = value;

    // Check if user exists
    let row;
    try {
      row = await db('users').select('email', 'created_at').where({ email }).first();
    } catch (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (row) {
      // User exists
      return res.json({
        message: 'Login successful',
        user: {
          email: row.email,
          createdAt: row.created_at,
          isAdmin: isAdminEmail(row.email)
        }
      });
    }

    // Create new user
    try {
      await db('users').insert({ email });
    } catch (err) {
      console.error('Error creating user:', err);
      return res.status(500).json({ error: 'Failed to create user' });
    }

    res.status(201).json({
      message: 'User created and logged in successfully',
      user: {
        email: email,
        createdAt: new Date().toISOString(),
        isAdmin: isAdminEmail(email)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get current user info
router.get('/me', authenticateUser, async (req, res) => {
  let row;
  try {
    row = await db('users').select('email', 'created_at').where({ email: req.userEmail }).first();
  } catch (err) {
    console.error('Database error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  if (!row) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    user: {
      email: row.email,
      createdAt: row.created_at,
      isAdmin: isAdminEmail(row.email)
    }
  });
});

module.exports = router;
