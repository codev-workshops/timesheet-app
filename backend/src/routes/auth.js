const express = require('express');
const { getDatabase } = require('../database/init');
const { credentialsSchema } = require('../validation/schemas');
const { authenticateUser } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { hashPassword, verifyPassword } = require('../security/password');
const { issueToken } = require('../security/token');

const router = express.Router();

const INVALID_CREDENTIALS = 'Invalid email or password';

// Hash compared against when the account does not exist, so the response time
// does not reveal which emails are registered.
const dummyHashPromise = hashPassword('timesheet-app-dummy-password');

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

// Register a new account with a password
router.post('/register', validate('body', credentialsSchema), async (req, res) => {
  const { email, password } = req.body;

  try {
    const db = getDatabase();
    const existing = await dbGet(db, 'SELECT email FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await hashPassword(password);
    try {
      await dbRun(db, 'INSERT INTO users (email, password_hash) VALUES (?, ?)', [email, passwordHash]);
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT') {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }
      console.error('Error creating user:', err);
      return res.status(500).json({ error: 'Failed to create user' });
    }

    res.status(201).json({
      message: 'User created and logged in successfully',
      token: issueToken(email),
      user: {
        email,
        createdAt: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Log in with email and password
router.post('/login', validate('body', credentialsSchema), async (req, res) => {
  const { email, password } = req.body;

  try {
    const db = getDatabase();
    const row = await dbGet(
      db,
      'SELECT email, password_hash, created_at FROM users WHERE email = ?',
      [email]
    );

    const storedHash = row && row.password_hash ? row.password_hash : await dummyHashPromise;
    const passwordMatches = await verifyPassword(password, storedHash);

    if (!row || !row.password_hash || !passwordMatches) {
      return res.status(401).json({ error: INVALID_CREDENTIALS });
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
    console.error('Login error:', err);
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
