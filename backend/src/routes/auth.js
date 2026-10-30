const express = require('express');
const { getDatabase } = require('../database/init');
const { loginSchema, registerSchema } = require('../validation/schemas');
const { authenticateUser, issueToken } = require('../middleware/auth');
const { hashPassword, verifyPassword } = require('../utils/password');

const router = express.Router();

function dbGet(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function dbRun(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

function isUniqueViolation(err) {
  return Boolean(err && typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT'));
}

router.post('/register', async (req, res, next) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) {
    return next(error);
  }

  const { email, password } = value;
  try {
    const db = getDatabase();
    const existing = await dbGet(db, 'SELECT email FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await hashPassword(password);
    await dbRun(db, 'INSERT INTO users (email, password_hash) VALUES (?, ?)', [email, passwordHash]);

    res.status(201).json({
      message: 'User registered successfully',
      token: issueToken(email),
      user: {
        email,
        createdAt: new Date().toISOString()
      }
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    console.error('Error registering user:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res, next) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) {
    return next(error);
  }

  const { email, password } = value;
  try {
    const db = getDatabase();
    const row = await dbGet(
      db,
      'SELECT email, password_hash, created_at FROM users WHERE email = ?',
      [email]
    );
    const isValid = await verifyPassword(password, row ? row.password_hash : null);
    if (!row || !isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    res.json({
      message: 'Login successful',
      token: issueToken(row.email),
      user: {
        email: row.email,
        createdAt: row.created_at
      }
    });
  } catch (err) {
    console.error('Error logging in:', err);
    res.status(500).json({ error: 'Internal server error' });
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
