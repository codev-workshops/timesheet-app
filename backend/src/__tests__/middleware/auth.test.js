const express = require('express');
const request = require('supertest');
const { authenticateUser, requireAdmin, isAdminEmail } = require('../../middleware/auth');
const { db, resetDatabase, insertUsers, breakTable, failOn } = require('../helpers/db');

const app = express();
app.get('/protected', authenticateUser, (req, res) => res.json({ userEmail: req.userEmail }));
app.get('/admin', authenticateUser, requireAdmin, (req, res) => res.json({ ok: true }));

describe('Authentication Middleware', () => {
  beforeEach(resetDatabase);

  describe('Email header validation', () => {
    test('returns 401 if x-user-email header is missing', async () => {
      const res = await request(app).get('/protected');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'User email required in x-user-email header' });
    });

    test.each(['invalid-email', 'notanemail', 'test@', 'test@domain', 'a b@example.com'])(
      'returns 400 for invalid email %p',
      async (email) => {
        const res = await request(app).get('/protected').set('x-user-email', email);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Invalid email format' });
        expect(await db('users').count({ n: '*' }).first()).toEqual({ n: 0 });
      }
    );

    test('accepts email with subdomain', async () => {
      const res = await request(app).get('/protected').set('x-user-email', 'test@mail.example.com');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ userEmail: 'test@mail.example.com' });
    });
  });

  describe('Existing user', () => {
    test('authenticates and sets req.userEmail without inserting a duplicate', async () => {
      await insertUsers('existing@example.com');

      const res = await request(app).get('/protected').set('x-user-email', 'existing@example.com');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ userEmail: 'existing@example.com' });
      const rows = await db('users').where({ email: 'existing@example.com' });
      expect(rows).toHaveLength(1);
    });
  });

  describe('New user', () => {
    test('creates the user row and calls next()', async () => {
      const res = await request(app).get('/protected').set('x-user-email', 'newuser@example.com');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ userEmail: 'newuser@example.com' });
      const user = await db('users').where({ email: 'newuser@example.com' }).first();
      expect(user).toBeDefined();
      expect(user.created_at).toBeTruthy();
    });

    test('repeat requests keep a single user row', async () => {
      await request(app).get('/protected').set('x-user-email', 'repeat@example.com');
      await request(app).get('/protected').set('x-user-email', 'repeat@example.com');
      expect(await db('users').where({ email: 'repeat@example.com' })).toHaveLength(1);
    });
  });

  describe('Database errors', () => {
    test('returns 500 Internal server error when user lookup fails', async () => {
      await breakTable('users');

      const res = await request(app).get('/protected').set('x-user-email', 'test@example.com');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
      expect(console.error).toHaveBeenCalled();
    });

    test('returns 500 Failed to create user when insert fails', async () => {
      await failOn('users', 'INSERT');

      const res = await request(app).get('/protected').set('x-user-email', 'newuser@example.com');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to create user' });
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('requireAdmin', () => {
    const ORIGINAL_ADMIN_EMAILS = process.env.ADMIN_EMAILS;

    afterEach(() => {
      if (ORIGINAL_ADMIN_EMAILS === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS;
    });

    test('allows an email listed in ADMIN_EMAILS', async () => {
      process.env.ADMIN_EMAILS = 'admin@example.com';
      const res = await request(app).get('/admin').set('x-user-email', 'admin@example.com');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    test('matching is trimmed and case-insensitive across a comma-separated list', async () => {
      process.env.ADMIN_EMAILS = ' first@example.com ,  Admin@Example.COM ,';
      const res = await request(app).get('/admin').set('x-user-email', 'admin@example.com');
      expect(res.status).toBe(200);
    });

    test('returns 403 for a non-admin', async () => {
      process.env.ADMIN_EMAILS = 'admin@example.com';
      const res = await request(app).get('/admin').set('x-user-email', 'user@example.com');
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Admin access required' });
    });

    test.each([undefined, ''])('returns 403 when ADMIN_EMAILS is %p', async (value) => {
      if (value === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = value;
      const res = await request(app).get('/admin').set('x-user-email', 'admin@example.com');
      expect(res.status).toBe(403);
    });

    test('reads ADMIN_EMAILS at request time', async () => {
      process.env.ADMIN_EMAILS = '';
      expect((await request(app).get('/admin').set('x-user-email', 'late@example.com')).status).toBe(403);
      process.env.ADMIN_EMAILS = 'late@example.com';
      expect((await request(app).get('/admin').set('x-user-email', 'late@example.com')).status).toBe(200);
    });

    test('still returns 401 without the auth header (authenticateUser runs first)', async () => {
      process.env.ADMIN_EMAILS = 'admin@example.com';
      const res = await request(app).get('/admin');
      expect(res.status).toBe(401);
    });

    test('isAdminEmail returns false for empty input', () => {
      process.env.ADMIN_EMAILS = 'admin@example.com';
      expect(isAdminEmail(undefined)).toBe(false);
      expect(isAdminEmail('')).toBe(false);
    });
  });
});
