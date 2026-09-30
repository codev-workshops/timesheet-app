const express = require('express');
const { getDatabase } = require('../database/init');
const { emailSchema } = require('../validation/schemas');
const { authenticateUser, signToken } = require('../middleware/auth');

const router = express.Router();

// Login endpoint - creates user if doesn't exist, returns a JWT
router.post('/login', async (req, res, next) => {
  try {
    const { error, value } = emailSchema.validate(req.body);
    if (error) {
      return next(error);
    }

    const { email } = value;
    const db = getDatabase();

    // Create the user if missing, atomically (no SELECT/INSERT race)
    db.run('INSERT OR IGNORE INTO users (email) VALUES (?)', [email], function(err) {
      if (err) {
        console.error('Error creating user:', err);
        return res.status(500).json({ error: 'Failed to create user' });
      }

      const created = this.changes > 0;

      db.get('SELECT email, created_at FROM users WHERE email = ?', [email], (err, row) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Internal server error' });
        }

        if (!row) {
          return res.status(500).json({ error: 'Internal server error' });
        }

        res.status(created ? 201 : 200).json({
          message: created ? 'User created and logged in successfully' : 'Login successful',
          user: {
            email: row.email,
            createdAt: row.created_at
          },
          token: signToken(row.email)
        });
      });
    });
  } catch (error) {
    next(error);
  }
});

// Get current user info
router.get('/me', authenticateUser, (req, res) => {
  const db = getDatabase();

  db.get('SELECT email, created_at FROM users WHERE email = ?', [req.userEmail], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (!row) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        email: row.email,
        createdAt: row.created_at
      }
    });
  });
});

module.exports = router;
