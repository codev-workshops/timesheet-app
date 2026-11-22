const express = require('express');
const request = require('supertest');
const { authenticateUser } = require('../../middleware/auth');
const { getDatabase } = require('../../database/init');

jest.mock('../../database/init');

describe('Authentication Middleware - edge cases', () => {
  let req, res, next, mockDb;

  const userExists = () =>
    mockDb.get.mockImplementation((query, params, cb) => cb(null, { email: params[0] }));
  const userMissing = () => mockDb.get.mockImplementation((query, params, cb) => cb(null, undefined));

  beforeEach(() => {
    req = { headers: {} };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
    mockDb = { get: jest.fn(), run: jest.fn() };
    getDatabase.mockReturnValue(mockDb);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('missing / empty header values', () => {
    test('empty string header returns 401 and never touches the DB', () => {
      req.headers['x-user-email'] = '';
      authenticateUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(getDatabase).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    test('whitespace-only header returns 400', () => {
      req.headers['x-user-email'] = '   ';
      authenticateUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(getDatabase).not.toHaveBeenCalled();
    });

    test('a differently named header (e.g. x-email) is not accepted', () => {
      req.headers['x-email'] = 'user@example.com';
      authenticateUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('email format', () => {
    test.each([
      ['leading whitespace', ' user@example.com'],
      ['trailing whitespace', 'user@example.com '],
      ['inner whitespace', 'us er@example.com'],
      ['two @ signs', 'user@@example.com'],
      ['missing local part', '@example.com'],
      ['comma-joined list of emails', 'a@example.com, b@example.com'],
      ['tab character', 'user\t@example.com']
    ])('rejects %s with 400 and no DB access', (_label, email) => {
      req.headers['x-user-email'] = email;
      authenticateUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid email format' });
      expect(getDatabase).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    test.each([
      ['plus addressing', 'user+tag@example.com'],
      ['dots in local part', 'first.last@example.co.uk'],
      ['numeric domain', 'user@123.456'],
      ['uppercase letters', 'User@Example.COM']
    ])('accepts %s', (_label, email) => {
      req.headers['x-user-email'] = email;
      userExists();
      authenticateUser(req, res, next);
      expect(res.status).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.userEmail).toBe(email);
    });

    test('SQL-looking but syntactically valid email is passed only as a bound parameter', () => {
      const email = "x'or'1'='1@example.com";
      req.headers['x-user-email'] = email;
      userMissing();
      mockDb.run.mockImplementation((query, params, cb) => cb(null));
      authenticateUser(req, res, next);
      expect(mockDb.get).toHaveBeenCalledWith(
        'SELECT email FROM users WHERE email = ?',
        [email],
        expect.any(Function)
      );
      expect(mockDb.get.mock.calls[0][0]).not.toContain(email);
      expect(mockDb.run.mock.calls[0][0]).not.toContain(email);
      expect(mockDb.run.mock.calls[0][1]).toEqual([email]);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('control flow', () => {
    test('existing user: next() called exactly once and no INSERT', () => {
      req.headers['x-user-email'] = 'user@example.com';
      userExists();
      authenticateUser(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('new user: req.userEmail is not set before the INSERT completes', () => {
      req.headers['x-user-email'] = 'new@example.com';
      userMissing();
      let insertCb;
      mockDb.run.mockImplementation((query, params, cb) => { insertCb = cb; });
      authenticateUser(req, res, next);
      expect(req.userEmail).toBeUndefined();
      expect(next).not.toHaveBeenCalled();
      insertCb(null);
      expect(req.userEmail).toBe('new@example.com');
      expect(next).toHaveBeenCalledTimes(1);
    });

    test('DB lookup error does not set req.userEmail and does not INSERT', () => {
      req.headers['x-user-email'] = 'user@example.com';
      mockDb.get.mockImplementation((query, params, cb) => cb(new Error('boom')));
      authenticateUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(req.userEmail).toBeUndefined();
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('INSERT error does not set req.userEmail', () => {
      req.headers['x-user-email'] = 'new@example.com';
      userMissing();
      mockDb.run.mockImplementation((query, params, cb) => cb(new Error('insert failed')));
      authenticateUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(req.userEmail).toBeUndefined();
      expect(next).not.toHaveBeenCalled();
    });

    // BUG: two concurrent first requests for the same new user both see "no row",
    // the second INSERT fails with a PRIMARY KEY/UNIQUE constraint, and the middleware
    // returns 500 "Failed to create user" even though the user now exists.
    // Fix idea: INSERT OR IGNORE (or treat SQLITE_CONSTRAINT as success).
    test.skip('BUG: concurrent first-time requests should not 500 on SQLITE_CONSTRAINT', () => {
      req.headers['x-user-email'] = 'race@example.com';
      userMissing();
      const err = Object.assign(new Error('UNIQUE constraint failed: users.email'), {
        code: 'SQLITE_CONSTRAINT'
      });
      mockDb.run.mockImplementation((query, params, cb) => cb(err));
      authenticateUser(req, res, next);
      expect(res.status).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.userEmail).toBe('race@example.com');
    });

    // BUG: emails are not normalised, so "User@Example.com" and "user@example.com"
    // become two separate users with separate (isolated) data.
    test.skip('BUG: email should be case-normalised before lookup', () => {
      req.headers['x-user-email'] = 'User@Example.com';
      userExists();
      authenticateUser(req, res, next);
      expect(mockDb.get.mock.calls[0][1]).toEqual(['user@example.com']);
      expect(req.userEmail).toBe('user@example.com');
    });
  });

  describe('over HTTP (express + supertest)', () => {
    let app;

    beforeEach(() => {
      app = express();
      app.get('/protected', authenticateUser, (r, s) => s.json({ user: r.userEmail }));
      userExists();
    });

    test('header name is case-insensitive', async () => {
      const response = await request(app).get('/protected').set('X-USER-EMAIL', 'user@example.com');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ user: 'user@example.com' });
    });

    test('surrounding whitespace in the raw header is trimmed by HTTP parsing and accepted', async () => {
      const response = await request(app).get('/protected').set('x-user-email', '  user@example.com  ');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ user: 'user@example.com' });
    });

    test('duplicate x-user-email headers are rejected (joined value is not a valid email)', async () => {
      const response = await request(app)
        .get('/protected')
        .set('x-user-email', ['a@example.com', 'b@example.com']);
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid email format' });
    });

    test('missing header returns 401 JSON and handler is not reached', async () => {
      const response = await request(app).get('/protected');
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'User email required in x-user-email header' });
    });

    test('DB failure returns 500 JSON', async () => {
      mockDb.get.mockImplementation((query, params, cb) => cb(new Error('db down')));
      const response = await request(app).get('/protected').set('x-user-email', 'user@example.com');
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });
});
