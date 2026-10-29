const express = require('express');
const request = require('supertest');
const { authenticateUser } = require('../../middleware/auth');
const { db, resetDatabase, insertUsers, breakTable, failOn } = require('../helpers/db');

const app = express();
app.get('/protected', authenticateUser, (req, res) => res.json({ userEmail: req.userEmail }));

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
});
