const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const authRoutes = require('../../routes/auth');
const { getDatabase } = require('../../database/init');

jest.mock('../../database/init');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRoutes);
app.use((err, req, res, next) => {
  if (err.isJoi) {
    return res.status(400).json({ error: 'Validation error' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

describe('Auth Routes', () => {
  let mockDb;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    mockDb = {
      get: jest.fn(),
      run: jest.fn(),
    };
    getDatabase.mockReturnValue(mockDb);
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    jest.clearAllMocks();
  });

  test('logs in an existing user and sets auth cookies', async () => {
    mockDb.get.mockImplementation((query, params, callback) => {
      callback(null, {
        email: 'existing@example.com',
        created_at: '2024-01-01T00:00:00.000Z',
      });
    });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'existing@example.com' });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Login successful');
    expect(response.body.user.email).toBe('existing@example.com');
    expect(response.body.token).toBeUndefined();
    expect(response.headers['set-cookie'].join(';')).toEqual(
      expect.stringMatching(/token=.*HttpOnly.*SameSite=Strict/)
    );
    expect(response.headers['set-cookie'].join(';')).toEqual(
      expect.stringMatching(/csrfToken=.*SameSite=Strict/)
    );
    expect(response.headers['set-cookie'].join(';')).not.toEqual(
      expect.stringMatching(/csrfToken=.*HttpOnly/)
    );
  });

  test('creates a new user on first login', async () => {
    mockDb.get.mockImplementation((query, params, callback) => callback(null, null));
    mockDb.run.mockImplementation(function callback(query, params, callbackFn) {
      callbackFn.call(this, null);
    });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'newuser@example.com' });

    expect(response.status).toBe(201);
    expect(response.body.message).toBe('User created and logged in successfully');
    expect(mockDb.run).toHaveBeenCalledWith(
      'INSERT INTO users (email) VALUES (?)',
      ['newuser@example.com'],
      expect.any(Function)
    );
  });

  test('returns 400 for invalid email', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'invalid-email' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation error');
  });

  test('handles a database error when checking the user', async () => {
    mockDb.get.mockImplementation((query, params, callback) => {
      callback(new Error('Database error'), null);
    });
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com' });
    expect(response.status).toBe(500);
  });

  test('handles a database error when creating a user', async () => {
    mockDb.get.mockImplementation((query, params, callback) => callback(null, null));
    mockDb.run.mockImplementation((query, params, callback) => {
      callback(new Error('Insert failed'));
    });
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'newuser@example.com' });
    expect(response.status).toBe(500);
  });

  test('returns 500 for an unexpected error', async () => {
    getDatabase.mockImplementation(() => {
      throw new Error('Unexpected error');
    });
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com' });
    expect(response.status).toBe(500);
  });

  test('returns the current user from the JWT cookie', async () => {
    mockDb.get.mockImplementation((query, params, callback) => {
      callback(null, {
        email: 'test@example.com',
        created_at: '2024-01-01T00:00:00.000Z',
      });
    });
    const token = jwt.sign({ email: 'test@example.com' }, process.env.JWT_SECRET);
    const response = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [`token=${token}`]);
    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe('test@example.com');
  });

  test('returns 401 when the auth cookie is missing', async () => {
    const response = await request(app).get('/api/auth/me');
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Authentication required' });
  });

  test('returns 404 when the user is not found', async () => {
    mockDb.get.mockImplementation((query, params, callback) => callback(null, null));
    const token = jwt.sign({ email: 'test@example.com' }, process.env.JWT_SECRET);
    const response = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [`token=${token}`]);
    expect(response.status).toBe(404);
  });

  test('clears auth cookies on logout', async () => {
    const response = await request(app).post('/api/auth/logout');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Logout successful' });
    expect(response.headers['set-cookie'].join(';')).toEqual(
      expect.stringMatching(/token=;.*Expires=/)
    );
  });
});
