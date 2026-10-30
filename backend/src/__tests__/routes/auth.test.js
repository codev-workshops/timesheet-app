const request = require('supertest');
const express = require('express');
const authRoutes = require('../../routes/auth');
const { issueToken } = require('../../middleware/auth');
const { hashPassword } = require('../../utils/password');
const { getDatabase } = require('../../database/init');

jest.mock('../../database/init');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
// Add error handler for Joi validation
app.use((err, req, res, next) => {
  if (err.isJoi) {
    return res.status(400).json({ error: 'Validation error' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

describe('Auth Routes', () => {
  let mockDb;
  let users;

  beforeEach(() => {
    users = {};
    mockDb = {
      get: jest.fn((query, params, callback) => callback(null, users[params[0]])),
      run: jest.fn((query, params, callback) => {
        users[params[0]] = { email: params[0], password_hash: params[1], created_at: '2024-01-01' };
        callback(null);
      })
    };
    getDatabase.mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function addUser(email, password) {
    users[email] = {
      email,
      password_hash: password === null ? null : await hashPassword(password),
      created_at: '2024-01-01T00:00:00.000Z'
    };
  }

  describe('POST /api/auth/register', () => {
    test('should create a user with a hashed password and return a token', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'newuser@example.com', password: 'correct horse' });

      expect(response.status).toBe(201);
      expect(response.body.user.email).toBe('newuser@example.com');
      expect(typeof response.body.token).toBe('string');
      const [query, params] = mockDb.run.mock.calls[0];
      expect(query).toBe('INSERT INTO users (email, password_hash) VALUES (?, ?)');
      expect(params[0]).toBe('newuser@example.com');
      expect(params[1]).not.toContain('correct horse');
      expect(params[1].startsWith('scrypt$')).toBe(true);

      const me = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${response.body.token}`);
      expect(me.status).toBe(200);
      expect(me.body.user.email).toBe('newuser@example.com');
    });

    test('should return 409 when the email is already registered', async () => {
      await addUser('existing@example.com', 'original-password');

      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'existing@example.com', password: 'attacker-password' });

      expect(response.status).toBe(409);
      expect(response.body.token).toBeUndefined();
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('should return 409 when a passwordless legacy account exists', async () => {
      await addUser('legacy@example.com', null);

      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'legacy@example.com', password: 'claim-attempt' });

      expect(response.status).toBe(409);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('should return 409 when a concurrent insert hits the unique constraint', async () => {
      mockDb.run.mockImplementation((query, params, callback) => {
        const err = new Error('UNIQUE constraint failed: users.email');
        err.code = 'SQLITE_CONSTRAINT';
        callback(err);
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'race@example.com', password: 'longenough' });

      expect(response.status).toBe(409);
    });

    test('should return 400 for a password shorter than 8 characters', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'newuser@example.com', password: 'short' });

      expect(response.status).toBe(400);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('should return 500 on database error', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(new Error('Database error')));

      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'newuser@example.com', password: 'longenough' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('POST /api/auth/login', () => {
    test('should log in with the correct password and return a token', async () => {
      await addUser('existing@example.com', 'correct horse');

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'existing@example.com', password: 'correct horse' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Login successful');
      expect(response.body.user).toEqual({
        email: 'existing@example.com',
        createdAt: '2024-01-01T00:00:00.000Z'
      });
      expect(typeof response.body.token).toBe('string');
    });

    test('should return 401 for a wrong password', async () => {
      await addUser('existing@example.com', 'correct horse');

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'existing@example.com', password: 'wrong horse' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid email or password' });
    });

    test('should return 401 and not create a user for an unknown email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'unknown@example.com', password: 'anything' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid email or password' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('should return 401 for a legacy account without a password', async () => {
      await addUser('legacy@example.com', null);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'legacy@example.com', password: 'anything' });

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
        .send({ email: 'invalid-email', password: 'anything' });

      expect(response.status).toBe(400);
    });

    test('should return 500 on database error', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(new Error('Database error')));

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'anything' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('should return 500 on unexpected errors', async () => {
      getDatabase.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'anything' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('GET /api/auth/me', () => {
    test('should return the user identified by the token', async () => {
      await addUser('alice@example.com', 'alice-password');
      await addUser('bob@example.com', 'bob-password');

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${issueToken('alice@example.com')}`)
        .set('x-user-email', 'bob@example.com');

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe('alice@example.com');
    });

    test('should return 401 when only x-user-email is provided', async () => {
      await addUser('alice@example.com', 'alice-password');

      const response = await request(app)
        .get('/api/auth/me')
        .set('x-user-email', 'alice@example.com');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Authentication required' });
    });

    test('should return 404 if user record disappears after authentication', async () => {
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
});
