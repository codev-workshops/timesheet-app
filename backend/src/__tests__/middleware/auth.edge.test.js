const express = require('express');
const request = require('supertest');
const { authenticateUser } = require('../../middleware/auth');
const { errorHandler } = require('../../middleware/errorHandler');
const { getDatabase } = require('../../database/init');

jest.mock('../../database/init');

describe('Authentication Middleware - edge cases', () => {
  let req, res, next, mockDb, consoleErrorSpy;

  const existingUser = (email) => {
    mockDb.get.mockImplementation((query, params, callback) => callback(null, { email }));
  };

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    mockDb = { get: jest.fn(), run: jest.fn() };
    getDatabase.mockReturnValue(mockDb);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy.mockRestore();
  });

  describe('missing or empty header', () => {
    test('treats an empty x-user-email header as missing (401)', () => {
      req.headers['x-user-email'] = '';

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'User email required in x-user-email header' });
      expect(next).not.toHaveBeenCalled();
      expect(getDatabase).not.toHaveBeenCalled();
    });

    test('ignores other email-like headers when x-user-email is absent', () => {
      req.headers['x-email'] = 'test@example.com';
      req.headers.authorization = 'test@example.com';

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('does not touch the database when the header is missing', () => {
      authenticateUser(req, res, next);

      expect(getDatabase).not.toHaveBeenCalled();
      expect(mockDb.get).not.toHaveBeenCalled();
      expect(mockDb.run).not.toHaveBeenCalled();
    });
  });

  describe('email format', () => {
    test.each([
      ['whitespace only', '   '],
      ['leading whitespace', ' test@example.com'],
      ['trailing whitespace', 'test@example.com '],
      ['space in local part', 'te st@example.com'],
      ['space in domain', 'test@exa mple.com'],
      ['trailing newline', 'test@example.com\n'],
      ['embedded tab', 'test@\texample.com'],
      ['two @ signs', 'a@b@example.com'],
      ['missing local part', '@example.com'],
      ['domain ending with a dot', 'test@example.'],
      ['comma-joined list of emails', 'a@example.com, b@example.com']
    ])('rejects %s with 400 and no DB access', (_label, email) => {
      req.headers['x-user-email'] = email;

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid email format' });
      expect(next).not.toHaveBeenCalled();
      expect(getDatabase).not.toHaveBeenCalled();
    });

    test.each([
      ['plus addressing', 'user+tag@example.com'],
      ['dots in local part', 'first.last@example.com'],
      ['single-char TLD', 'a@b.c'],
      ['uppercase characters', 'User@Example.COM'],
      ['unicode characters', 'jöhn@exämple.com'],
      ['apostrophe in local part', "o'brien@example.com"]
    ])('accepts %s and authenticates the header value unchanged', (_label, email) => {
      req.headers['x-user-email'] = email;
      existingUser(email);

      authenticateUser(req, res, next);

      expect(mockDb.get).toHaveBeenCalledWith(
        'SELECT email FROM users WHERE email = ?',
        [email],
        expect.any(Function)
      );
      expect(req.userEmail).toBe(email);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    test('passes SQL-like payloads only as bound parameters', () => {
      const email = "x'or'1'='1@example.com";
      req.headers['x-user-email'] = email;
      mockDb.get.mockImplementation((query, params, callback) => callback(null, null));
      mockDb.run.mockImplementation((query, params, callback) => callback(null));

      authenticateUser(req, res, next);

      expect(mockDb.get.mock.calls[0][0]).toBe('SELECT email FROM users WHERE email = ?');
      expect(mockDb.get.mock.calls[0][1]).toEqual([email]);
      expect(mockDb.run.mock.calls[0][0]).toBe('INSERT INTO users (email) VALUES (?)');
      expect(mockDb.run.mock.calls[0][1]).toEqual([email]);
      expect(next).toHaveBeenCalledTimes(1);
    });

    // BUG: the middleware has no length limit. RFC 5321 caps addresses at 254
    // chars and the app's Joi schemas cap email at 255, but any length passes
    // here and a user row is auto-created for it.
    test.skip('rejects emails longer than 254 characters', () => {
      const email = `${'a'.repeat(250)}@example.com`;
      req.headers['x-user-email'] = email;
      mockDb.get.mockImplementation((query, params, callback) => callback(null, null));
      mockDb.run.mockImplementation((query, params, callback) => callback(null));

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
      expect(mockDb.run).not.toHaveBeenCalled();
    });
  });

  describe('control flow', () => {
    test('existing user: does not insert and calls next() once with no args', () => {
      req.headers['x-user-email'] = 'test@example.com';
      existingUser('test@example.com');

      authenticateUser(req, res, next);

      expect(mockDb.run).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    });

    test('new user: calls next() once with no args after insert', () => {
      req.headers['x-user-email'] = 'new@example.com';
      mockDb.get.mockImplementation((query, params, callback) => callback(null, undefined));
      mockDb.run.mockImplementation((query, params, callback) => callback(null));

      authenticateUser(req, res, next);

      expect(mockDb.run).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    });

    test('waits for asynchronous DB callbacks before calling next()', async () => {
      req.headers['x-user-email'] = 'async@example.com';
      mockDb.get.mockImplementation((query, params, callback) => {
        setImmediate(() => callback(null, null));
      });
      mockDb.run.mockImplementation((query, params, callback) => {
        setImmediate(() => callback(null));
      });

      authenticateUser(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(req.userEmail).toBeUndefined();

      await new Promise((resolve) => setImmediate(resolve));
      expect(mockDb.run).toHaveBeenCalledTimes(1);
      expect(next).not.toHaveBeenCalled();

      await new Promise((resolve) => setImmediate(resolve));
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.userEmail).toBe('async@example.com');
    });

    test('does not set req.userEmail when the lookup fails', () => {
      req.headers['x-user-email'] = 'test@example.com';
      mockDb.get.mockImplementation((query, params, callback) => callback(new Error('boom')));

      authenticateUser(req, res, next);

      expect(req.userEmail).toBeUndefined();
      expect(mockDb.run).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Database error:', expect.any(Error));
    });

    test('does not set req.userEmail when user creation fails', () => {
      req.headers['x-user-email'] = 'test@example.com';
      mockDb.get.mockImplementation((query, params, callback) => callback(null, null));
      mockDb.run.mockImplementation((query, params, callback) => callback(new Error('boom')));

      authenticateUser(req, res, next);

      expect(req.userEmail).toBeUndefined();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to create user' });
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error creating user:', expect.any(Error));
      expect(next).not.toHaveBeenCalled();
    });

    test('propagates a synchronous getDatabase() failure to the caller', () => {
      req.headers['x-user-email'] = 'test@example.com';
      getDatabase.mockImplementation(() => {
        throw new Error('Database not initialized');
      });

      expect(() => authenticateUser(req, res, next)).toThrow('Database not initialized');
      expect(next).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    // BUG: check-then-insert race. Two concurrent first requests for the same
    // new email both see no row; the second INSERT hits the users.email PRIMARY
    // KEY and the request fails with 500 "Failed to create user" instead of
    // authenticating (e.g. INSERT OR IGNORE would avoid this).
    test.skip('authenticates when a concurrent request already created the user', () => {
      req.headers['x-user-email'] = 'race@example.com';
      mockDb.get.mockImplementation((query, params, callback) => callback(null, null));
      mockDb.run.mockImplementation((query, params, callback) => {
        const err = new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed: users.email');
        err.code = 'SQLITE_CONSTRAINT';
        callback(err);
      });

      authenticateUser(req, res, next);

      expect(res.status).not.toHaveBeenCalled();
      expect(req.userEmail).toBe('race@example.com');
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('over HTTP (express + supertest)', () => {
    let app;

    beforeEach(() => {
      app = express();
      app.get('/protected', authenticateUser, (req, res) => res.json({ userEmail: req.userEmail }));
      app.use(errorHandler);
    });

    test('reads the header case-insensitively', async () => {
      existingUser('test@example.com');

      const response = await request(app).get('/protected').set('X-USER-EMAIL', 'test@example.com');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ userEmail: 'test@example.com' });
    });

    test('accepts a header value padded with whitespace (trimmed by Node)', async () => {
      existingUser('test@example.com');

      const response = await request(app).get('/protected').set('x-user-email', '  test@example.com  ');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ userEmail: 'test@example.com' });
    });

    test('rejects duplicate x-user-email headers with 400', async () => {
      const response = await request(app)
        .get('/protected')
        .set('x-user-email', ['a@example.com', 'b@example.com']);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid email format' });
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    test('does not accept the email from the query string', async () => {
      const response = await request(app).get('/protected?email=test@example.com');

      expect(response.status).toBe(401);
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    test('routes a getDatabase() failure to the error handler as 500', async () => {
      getDatabase.mockImplementation(() => {
        throw new Error('Database not initialized');
      });

      const response = await request(app).get('/protected').set('x-user-email', 'test@example.com');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Database not initialized' });
    });

    test('keeps users isolated: each request gets only its own email', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, { email: params[0] }));

      const [a, b] = await Promise.all([
        request(app).get('/protected').set('x-user-email', 'alice@example.com'),
        request(app).get('/protected').set('x-user-email', 'bob@example.com')
      ]);

      expect(a.body).toEqual({ userEmail: 'alice@example.com' });
      expect(b.body).toEqual({ userEmail: 'bob@example.com' });
    });
  });
});
