const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDatabase } = require('../database/init');
const { credentialsSchema } = require('../validation/schemas');
const { authenticateUser } = require('../middleware/auth');
const { getJwtSecret, jwtExpiresIn, jwtAlgorithm, bcryptRounds } = require('../config/auth');

const router = express.Router();

const INVALID_CREDENTIALS = 'Invalid email or password';

// A hash compared against when the email is unknown, so an unregistered email costs the same
// time as a wrong password and cannot be distinguished by response timing. Computed on first
// use to keep it off the startup path.
let dummyHash = null;
function getDummyHash() {
  if (!dummyHash) {
    dummyHash = bcrypt.hashSync('invalid-password-placeholder', bcryptRounds);
  }
  return dummyHash;
}

function dbGet(db, query, params) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function dbRun(db, query, params) {
  return new Promise((resolve, reject) => {
    db.run(query, params, (err) => (err ? reject(err) : resolve()));
  });
}

function issueToken(email) {
  return jwt.sign({ sub: email }, getJwtSecret(), {
    algorithm: jwtAlgorithm,
    expiresIn: jwtExpiresIn
  });
}

// Register a new account
router.post('/register', async (req, res, next) => {
  try {
    const { error, value } = credentialsSchema.validate(req.body);
    if (error) {
      return next(error);
    }

    const { email, password } = value;
    const db = getDatabase();

    const existing = await dbGet(db, 'SELECT email FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, bcryptRounds);
    await dbRun(db, 'INSERT INTO users (email, password_hash) VALUES (?, ?)', [email, passwordHash]);

    return res.status(201).json({
      message: 'Registration successful',
      token: issueToken(email),
      user: { email, createdAt: new Date().toISOString() }
    });
  } catch (err) {
    return next(err);
  }
});

// Log in with email and password
router.post('/login', async (req, res, next) => {
  try {
    const { error, value } = credentialsSchema.validate(req.body);
    if (error) {
      return next(error);
    }

    const { email, password } = value;
    const db = getDatabase();

    const user = await dbGet(
      db,
      'SELECT email, password_hash, created_at FROM users WHERE email = ?',
      [email]
    );

    // Always run a comparison, then use a single generic failure message for both an unknown
    // email and a wrong password so the endpoint cannot be used to enumerate accounts.
    const passwordMatches = await bcrypt.compare(password, user ? user.password_hash : getDummyHash());

    if (!user || !passwordMatches) {
      return res.status(401).json({ error: INVALID_CREDENTIALS });
    }

    return res.json({
      message: 'Login successful',
      token: issueToken(user.email),
      user: { email: user.email, createdAt: user.created_at }
    });
  } catch (err) {
    return next(err);
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
