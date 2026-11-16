const { authenticateUser } = require('../../middleware/auth');
const { getDatabase } = require('../../database/init');
const express = require('express');
const request = require('supertest');

jest.mock('../../database/init');

describe('Authentication Middleware', () => {
  let req, res, next, mockDb;

  beforeEach(() => {
    req = {
      headers: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    
    mockDb = {
      get: jest.fn(),
      run: jest.fn()
    };
    
    getDatabase.mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Email Header Validation', () => {
    test('should return 401 if x-user-email header is missing', () => {
      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'User email required in x-user-email header'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 400 if email format is invalid', () => {
      req.headers['x-user-email'] = 'invalid-email';

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid email format'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should accept valid email format', () => {
      req.headers['x-user-email'] = 'test@example.com';
      
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { email: 'test@example.com' });
      });

      authenticateUser(req, res, next);

      expect(mockDb.get).toHaveBeenCalled();
    });
  });

  describe('Existing User Authentication', () => {
    test('should authenticate existing user and call next()', (done) => {
      req.headers['x-user-email'] = 'existing@example.com';
      
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { email: 'existing@example.com' });
      });

      authenticateUser(req, res, next);

      setImmediate(() => {
        expect(req.userEmail).toBe('existing@example.com');
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
        done();
      });
    });

    test('should handle database error when checking user', (done) => {
      req.headers['x-user-email'] = 'test@example.com';
      
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      authenticateUser(req, res, next);

      setImmediate(() => {
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
          error: 'Internal server error'
        });
        expect(next).not.toHaveBeenCalled();
        done();
      });
    });
  });

  describe('New User Creation', () => {
    test('should create new user if not exists and call next()', (done) => {
      req.headers['x-user-email'] = 'newuser@example.com';
      
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null); // User doesn't exist
      });
      
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });

      authenticateUser(req, res, next);

      setImmediate(() => {
        expect(mockDb.run).toHaveBeenCalledWith(
          'INSERT INTO users (email) VALUES (?)',
          ['newuser@example.com'],
          expect.any(Function)
        );
        expect(req.userEmail).toBe('newuser@example.com');
        expect(next).toHaveBeenCalled();
        done();
      });
    });

    test('should handle error when creating new user', (done) => {
      req.headers['x-user-email'] = 'newuser@example.com';
      
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null);
      });
      
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(new Error('Insert failed'));
      });

      authenticateUser(req, res, next);

      setImmediate(() => {
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
          error: 'Failed to create user'
        });
        expect(next).not.toHaveBeenCalled();
        done();
      });
    });
  });

  describe('Email Format Edge Cases', () => {
    test('should reject email without @', () => {
      req.headers['x-user-email'] = 'notanemail';
      authenticateUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should reject email without domain', () => {
      req.headers['x-user-email'] = 'test@';
      authenticateUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should reject email without TLD', () => {
      req.headers['x-user-email'] = 'test@domain';
      authenticateUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should accept email with subdomain', () => {
      req.headers['x-user-email'] = 'test@mail.example.com';
      
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { email: 'test@mail.example.com' });
      });

      authenticateUser(req, res, next);
      expect(mockDb.get).toHaveBeenCalled();
    });
  });

  describe('Shared EMAIL_REGEX (module-level)', () => {
    test('should return 401 for an empty x-user-email header', () => {
      req.headers['x-user-email'] = '';
      authenticateUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    test.each([
      'user name@example.com',
      'user@exa mple.com',
      'user@@example.com',
      '@example.com',
      'user@example.',
      ' user@example.com'
    ])('should reject %p with 400 and never touch the database', (email) => {
      req.headers['x-user-email'] = email;
      authenticateUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid email format' });
      expect(getDatabase).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    test('should give consistent results across repeated calls (no regex state)', () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { email: params[0] });
      });

      for (let i = 0; i < 3; i++) {
        const r = { headers: { 'x-user-email': 'repeat@example.com' } };
        authenticateUser(r, res, next);
        expect(r.userEmail).toBe('repeat@example.com');
      }
      expect(next).toHaveBeenCalledTimes(3);

      for (let i = 0; i < 3; i++) {
        authenticateUser({ headers: { 'x-user-email': 'bad-email' } }, res, next);
      }
      expect(res.status).toHaveBeenCalledTimes(3);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).toHaveBeenCalledTimes(3);
    });

    test('should look up the user with a parameterized query', () => {
      req.headers['x-user-email'] = 'param@example.com';
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { email: 'param@example.com' });
      });

      authenticateUser(req, res, next);

      expect(mockDb.get).toHaveBeenCalledWith(
        'SELECT email FROM users WHERE email = ?',
        ['param@example.com'],
        expect.any(Function)
      );
      expect(mockDb.run).not.toHaveBeenCalled();
    });
  });

  describe('Integration with Express (per-user isolation)', () => {
    let app;

    beforeEach(() => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      app = express();
      app.get('/whoami', authenticateUser, (r, s) => s.json({ email: r.userEmail }));
    });

    afterEach(() => {
      console.error.mockRestore();
    });

    test('should attach each caller its own userEmail', async () => {
      const known = new Set(['alice@example.com']);
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, known.has(params[0]) ? { email: params[0] } : undefined);
      });
      mockDb.run.mockImplementation((query, params, callback) => {
        known.add(params[0]);
        callback(null);
      });

      const alice = await request(app).get('/whoami').set('x-user-email', 'alice@example.com');
      const bob = await request(app).get('/whoami').set('x-user-email', 'bob@example.com');

      expect(alice.status).toBe(200);
      expect(alice.body).toEqual({ email: 'alice@example.com' });
      expect(bob.status).toBe(200);
      expect(bob.body).toEqual({ email: 'bob@example.com' });
      expect(mockDb.run).toHaveBeenCalledTimes(1);
      expect(mockDb.run).toHaveBeenCalledWith(
        'INSERT INTO users (email) VALUES (?)',
        ['bob@example.com'],
        expect.any(Function)
      );
    });

    test('should return 401 without header and 400 for malformed email', async () => {
      const missing = await request(app).get('/whoami');
      expect(missing.status).toBe(401);
      expect(missing.body).toEqual({ error: 'User email required in x-user-email header' });

      const bad = await request(app).get('/whoami').set('x-user-email', 'not-an-email');
      expect(bad.status).toBe(400);
      expect(bad.body).toEqual({ error: 'Invalid email format' });
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    test('should return 500 when the user lookup fails', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('boom'));
      });

      const response = await request(app).get('/whoami').set('x-user-email', 'err@example.com');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });
});
