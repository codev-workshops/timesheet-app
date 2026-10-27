const express = require('express');
const rateLimit = require('express-rate-limit');
const { getDatabase } = require('../database/init');
const { registerSchema, loginSchema } = require('../validation/schemas');
const { authenticateUser, issueToken } = require('../middleware/auth');
const { hashPassword, verifyPassword } = require('../utils/password');

const router = express.Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test'
});
const DUMMY_PASSWORD_HASH = `scrypt$${'00'.repeat(16)}$${'00'.repeat(64)}`;

router.post('/register', authLimiter, (req, res, next) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return next(error);
    }

    const { email, password } = value;
    const db = getDatabase();

    db.get('SELECT email FROM users WHERE email = ?', [email], async (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (row) {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }

      try {
        const passwordHash = await hashPassword(password);
        db.run(
          'INSERT INTO users (email, password_hash) VALUES (?, ?)',
          [email, passwordHash],
          function(insertError) {
            if (insertError) {
              if (
                insertError.code?.startsWith('SQLITE_CONSTRAINT')
                || /unique constraint/i.test(insertError.message || '')
              ) {
                return res.status(409).json({ error: 'An account with this email already exists' });
              }
              return res.status(500).json({ error: 'Internal server error' });
            }

            return res.status(201).json({
              message: 'User registered successfully',
              token: issueToken(email),
              user: {
                email,
                createdAt: new Date().toISOString()
              }
            });
          });
      } catch {
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login', authLimiter, (req, res, next) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return next(error);
    }

    const { email, password } = value;
    const db = getDatabase();

    db.get(
      'SELECT email, created_at, password_hash FROM users WHERE email = ?',
      [email],
      async (err, row) => {
        if (err) {
          return res.status(500).json({ error: 'Internal server error' });
        }

        try {
          if (!row || !row.password_hash) {
            await verifyPassword(password, DUMMY_PASSWORD_HASH);
            return res.status(401).json({ error: 'Invalid email or password' });
          }

          if (!await verifyPassword(password, row.password_hash)) {
            return res.status(401).json({ error: 'Invalid email or password' });
          }

          return res.json({
            message: 'Login successful',
            token: issueToken(row.email),
            user: {
              email: row.email,
              createdAt: row.created_at
            }
          });
        } catch {
          return res.status(500).json({ error: 'Internal server error' });
        }
      }
    );
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
