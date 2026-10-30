const request = require('supertest');
const express = require('express');
const authRoutes = require('../../routes/auth');
const clientRoutes = require('../../routes/clients');
const { getDatabase } = require('../../database/init');
const { hashPassword } = require('../../security/password');
const { issueToken, verifyToken, resetJwtSecretForTests } = require('../../security/token');

jest.mock('../../database/init');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
// Add error handler for Joi validation
app.use((err, req, res, next) => {
  if (err.isJoi) {
    return res.status(400).json({ error: 'Validation error' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

const PASSWORD = 'correct-horse-battery';

describe('Auth Routes', () => {
  let mockDb;
  let passwordHash;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
    resetJwtSecretForTests();
    passwordHash = await hashPassword(PASSWORD);
  });

  afterAll(() => {
    delete process.env.JWT_SECRET;
    resetJwtSecretForTests();
  });

  beforeEach(() => {
    mockDb = {
      get: jest.fn(),
      run: jest.fn(),
      all: jest.fn()
    };
    getDatabase.mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    test('should create a user with a hashed password and return a token', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, undefined));
      mockDb.run.mockImplementation((query, params, callback) => callback(null));

      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: ' NewUser@Example.com ', password: PASSWORD });

      expect(response.status).toBe(201);
      expect(response.body.user.email).toBe('newuser@example.com');
      expect(verifyToken(response.body.token)).toBe('newuser@example.com');

      const [sql, params] = mockDb.run.mock.calls[0];
      expect(sql).toBe('INSERT INTO users (email, password_hash) VALUES (?, ?)');
      expect(params[0]).toBe('newuser@example.com');
      expect(params[1]).toMatch(/^scrypt\$/);
      expect(params[1]).not.toContain(PASSWORD);
    });

    test('should return 409 if the email is already registered', async () => {
      mockDb.get.mockImplementation((query, params, callback) =>
        callback(null, { email: 'existing@example.com' })
      );

      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'existing@example.com', password: PASSWORD });

      expect(response.status).toBe(409);
      expect(response.body.token).toBeUndefined();
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('should return 409 on a unique constraint race', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, undefined));
      mockDb.run.mockImplementation((query, params, callback) =>
        callback(Object.assign(new Error('UNIQUE constraint failed'), { code: 'SQLITE_CONSTRAINT' }))
      );

      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'race@example.com', password: PASSWORD });

      expect(response.status).toBe(409);
    });

    test('should return 500 when the insert fails', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, undefined));
      mockDb.run.mockImplementation((query, params, callback) => callback(new Error('Insert failed')));

      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'newuser@example.com', password: PASSWORD });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to create user' });
    });

    test('should return 400 for a short password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'newuser@example.com', password: 'short' });

      expect(response.status).toBe(400);
      expect(mockDb.get).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/login', () => {
    test('should log in with the right password and return a token', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, {
          email: 'existing@example.com',
          password_hash: passwordHash,
          created_at: '2024-01-01T00:00:00.000Z'
        });
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'Existing@Example.com', password: PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Login successful');
      expect(response.body.user.email).toBe('existing@example.com');
      expect(verifyToken(response.body.token)).toBe('existing@example.com');
      expect(mockDb.get.mock.calls[0][1]).toEqual(['existing@example.com']);
    });

    test('should return 401 for a wrong password', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { email: 'existing@example.com', password_hash: passwordHash });
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'existing@example.com', password: 'wrong-password' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid email or password' });
    });

    test('should return 401 and not create a user for an unknown email', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, undefined));

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'unknown@example.com', password: PASSWORD });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid email or password' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('should return 401 for an account without a password', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { email: 'legacy@example.com', password_hash: null });
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'legacy@example.com', password: PASSWORD });

      expect(response.status).toBe(401);
    });

    test('should return 400 for missing password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
    });

    test('should return 400 for invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'invalid-email', password: PASSWORD });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
    });

    test('should handle database error when checking user', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: PASSWORD });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('should handle unexpected errors', async () => {
      getDatabase.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: PASSWORD });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('GET /api/auth/me', () => {
    test('should return current user info for a valid token', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { email: params[0], created_at: '2024-01-01T00:00:00.000Z' });
      });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${issueToken('test@example.com')}`);

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.user.createdAt).toBe('2024-01-01T00:00:00.000Z');
    });

    test('should return 401 without a token', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Authentication required' });
    });

    test('should return 404 if user not found', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query === 'SELECT email FROM users WHERE email = ?') {
          callback(null, { email: 'test@example.com' });
        } else {
          callback(null, null);
        }
      });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${issueToken('test@example.com')}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'User not found' });
    });

    test('should handle database error', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query === 'SELECT email FROM users WHERE email = ?') {
          callback(null, { email: 'test@example.com' });
        } else {
          callback(new Error('Database error'), null);
        }
      });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${issueToken('test@example.com')}`);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('Protected routes with the real middleware', () => {
    beforeEach(() => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, { email: params[0] }));
      mockDb.all.mockImplementation((query, params, callback) => callback(null, []));
    });

    test('GET /api/clients with only x-user-email returns 401', async () => {
      const response = await request(app)
        .get('/api/clients')
        .set('x-user-email', 'victim@example.com');

      expect(response.status).toBe(401);
      expect(mockDb.all).not.toHaveBeenCalled();
    });

    test("a token for user A only queries user A's clients", async () => {
      const response = await request(app)
        .get('/api/clients')
        .set('Authorization', `Bearer ${issueToken('alice@example.com')}`)
        .set('x-user-email', 'bob@example.com');

      expect(response.status).toBe(200);
      expect(mockDb.all).toHaveBeenCalledTimes(1);
      expect(mockDb.all.mock.calls[0][1]).toEqual(['alice@example.com']);
    });
  });
});
