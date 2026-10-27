const TEST_SECRET = 'test-jwt-secret-with-at-least-32-characters';
process.env.JWT_SECRET = TEST_SECRET;

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const authRoutes = require('../../routes/auth');
const { issueToken } = require('../../middleware/auth');
const { hashPassword } = require('../../utils/password');
const { getDatabase } = require('../../database/init');

jest.mock('../../database/init');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use((err, req, res, next) => {
  if (err.isJoi) {
    return res.status(400).json({ error: 'Validation error' });
  }
  return res.status(500).json({ error: 'Internal server error' });
});

describe('Auth Routes', () => {
  let mockDb;

  beforeEach(() => {
    process.env.JWT_SECRET = TEST_SECRET;
    process.env.NODE_ENV = 'test';
    mockDb = {
      get: jest.fn(),
      run: jest.fn()
    };
    getDatabase.mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    test('registers a normalized email and stores only a scrypt hash', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, null));
      mockDb.run.mockImplementation((query, params, callback) => callback.call({}, null));

      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: '  Alice@Example.com  ', password: 'correct horse battery staple' });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('User registered successfully');
      expect(response.body.user.email).toBe('alice@example.com');
      expect(response.body.token).toEqual(expect.any(String));
      expect(jwt.verify(response.body.token, TEST_SECRET).sub).toBe('alice@example.com');

      const [query, params] = mockDb.run.mock.calls[0];
      expect(query).toBe('INSERT INTO users (email, password_hash) VALUES (?, ?)');
      expect(params[0]).toBe('alice@example.com');
      expect(params[1]).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
      expect(params[1]).not.toContain('correct horse battery staple');
    });

    test('returns 409 when the email already exists', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { email: 'alice@example.com' });
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'alice@example.com', password: 'password123' });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: 'An account with this email already exists' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('returns 400 for a short password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'alice@example.com', password: 'short' });

      expect(response.status).toBe(400);
      expect(mockDb.get).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/login', () => {
    test('logs in with the correct password and issues a JWT', async () => {
      const passwordHash = await hashPassword('correct password');
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, {
          email: 'alice@example.com',
          created_at: '2024-01-01 00:00:00',
          password_hash: passwordHash
        });
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'Alice@Example.com', password: 'correct password' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Login successful');
      expect(response.body.user).toEqual({
        email: 'alice@example.com',
        createdAt: '2024-01-01 00:00:00'
      });
      expect(jwt.verify(response.body.token, TEST_SECRET).sub).toBe('alice@example.com');
      expect(mockDb.get).toHaveBeenCalledWith(
        'SELECT email, created_at, password_hash FROM users WHERE email = ?',
        ['alice@example.com'],
        expect.any(Function)
      );
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('rejects a wrong password', async () => {
      const passwordHash = await hashPassword('correct password');
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, {
          email: 'alice@example.com',
          created_at: '2024-01-01 00:00:00',
          password_hash: passwordHash
        });
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'alice@example.com', password: 'wrong password' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid email or password' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('rejects an unknown user', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, null));

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'unknown@example.com', password: 'password123' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid email or password' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('rejects a legacy user with a null password hash', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, {
          email: 'legacy@example.com',
          created_at: '2024-01-01 00:00:00',
          password_hash: null
        });
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'legacy@example.com', password: 'password123' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid email or password' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('returns 400 when the password is missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'alice@example.com' });

      expect(response.status).toBe(400);
      expect(mockDb.get).not.toHaveBeenCalled();
      expect(mockDb.run).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/auth/me', () => {
    test('returns current user data with a valid Bearer token', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { email: 'alice@example.com', created_at: '2024-01-01 00:00:00' });
      });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${issueToken('alice@example.com')}`);

      expect(response.status).toBe(200);
      expect(response.body.user).toEqual({
        email: 'alice@example.com',
        createdAt: '2024-01-01 00:00:00'
      });
    });

    test('rejects x-user-email without a Bearer token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('x-user-email', 'alice@example.com');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Authentication required' });
      expect(mockDb.get).not.toHaveBeenCalled();
    });
  });
});
