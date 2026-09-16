const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getDatabase } = require('../database/init');
const { emailSchema } = require('../validation/schemas');
const { authenticateUser } = require('../middleware/auth');
const {
  AUTH_COOKIE,
  CSRF_COOKIE,
  authCookieOptions,
  csrfCookieOptions,
  getJwtExpiresIn,
  getJwtSecret,
  isProduction,
} = require('../config/auth');
const { dbGet, dbRun } = require('../database/promises');

const router = express.Router();

// Login endpoint - creates user if doesn't exist
router.post('/login', async (req, res, next) => {
  try {
    const { error, value } = emailSchema.validate(req.body);
    if (error) {
      return next(error);
    }

    const { email } = value;
    const db = getDatabase();

    const row = await dbGet(db, 'SELECT email, created_at FROM users WHERE email = ?', [email]);
    let status = 200;
    let message = 'Login successful';
    let createdAt = row && row.created_at;

    if (!row) {
      await dbRun(db, 'INSERT INTO users (email) VALUES (?)', [email]);
      status = 201;
      message = 'User created and logged in successfully';
      createdAt = new Date().toISOString();
    }

    const token = jwt.sign({ email }, getJwtSecret(), { expiresIn: getJwtExpiresIn() });
    const csrfToken = crypto.randomBytes(32).toString('hex');
    res.cookie(AUTH_COOKIE, token, authCookieOptions());
    res.cookie(CSRF_COOKIE, csrfToken, csrfCookieOptions());
    return res.status(status).json({
      message,
      user: { email, createdAt },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE, {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProduction(),
    path: '/',
  });
  res.clearCookie(CSRF_COOKIE, {
    httpOnly: false,
    sameSite: 'strict',
    secure: isProduction(),
    path: '/',
  });
  res.json({ message: 'Logout successful' });
});

router.get('/csrf', authenticateUser, (req, res) => {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE, csrfToken, csrfCookieOptions());
  res.json({ csrfToken });
});

// Get current user info
router.get('/me', authenticateUser, async (req, res, next) => {
  const db = getDatabase();
  try {
    const row = await dbGet(
      db,
      'SELECT email, created_at FROM users WHERE email = ?',
      [req.userEmail]
    );
    if (!row) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({
      user: { email: row.email, createdAt: row.created_at },
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
