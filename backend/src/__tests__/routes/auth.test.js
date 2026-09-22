const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authRoutes = require('../../routes/auth');
const { getDatabase } = require('../../database/init');
const { errorHandler } = require('../../middleware/errorHandler');
const { getJwtSecret, jwtAlgorithm, bcryptRounds } = require('../../config/auth');

jest.mock('../../database/init');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use(errorHandler);

const PASSWORD = 'correct-horse-battery';
const EMAIL = 'user@example.com';

describe('Auth Routes', () => {
  let mockDb;
  let passwordHash;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, bcryptRounds);
  });

  beforeEach(() => {
    mockDb = {
      get: jest.fn(),
      run: jest.fn()
    };
    getDatabase.mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const existingUser = (row) => {
    mockDb.get.mockImplementation((query, params, callback) => callback(null, row));
  };

  describe('POST /api/auth/register', () => {
    test('should create an account and return a signed token', async () => {
      existingUser(null);
      mockDb.run.mockImplementation((query, params, callback) => callback(null));

      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: EMAIL, password: PASSWORD });

      expect(response.status).toBe(201);
      expect(response.body.user.email).toBe(EMAIL);

      const payload = jwt.verify(response.body.token, getJwtSecret(), { algorithms: [jwtAlgorithm] });
      expect(payload.sub).toBe(EMAIL);
    });

    test('should store a bcrypt hash and never the plaintext password', async () => {
      existingUser(null);
      mockDb.run.mockImplementation((query, params, callback) => callback(null));

      await request(app)
        .post('/api/auth/register')
        .send({ email: EMAIL, password: PASSWORD });

      const [query, params] = mockDb.run.mock.calls[0];
      expect(query).toContain('password_hash');
      expect(params[1]).not.toBe(PASSWORD);
      expect(params[1]).toMatch(/^\$2[aby]\$/);
      await expect(bcrypt.compare(PASSWORD, params[1])).resolves.toBe(true);
    });

    test('should reject a duplicate email', async () => {
      existingUser({ email: EMAIL });

      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: EMAIL, password: PASSWORD });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: 'Email already registered' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('should reject a password shorter than 12 characters', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: EMAIL, password: 'short' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
    });

    test('should reject a missing password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: EMAIL });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
    });

    test('should reject an invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: PASSWORD });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
    });
  });

  describe('POST /api/auth/login', () => {
    test('should return a signed token for correct credentials', async () => {
      existingUser({ email: EMAIL, password_hash: passwordHash, created_at: '2024-01-01T00:00:00.000Z' });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: EMAIL, password: PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe(EMAIL);

      const payload = jwt.verify(response.body.token, getJwtSecret(), { algorithms: [jwtAlgorithm] });
      expect(payload.sub).toBe(EMAIL);
    });

    test('should never return the password hash', async () => {
      existingUser({ email: EMAIL, password_hash: passwordHash, created_at: '2024-01-01T00:00:00.000Z' });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: EMAIL, password: PASSWORD });

      expect(JSON.stringify(response.body)).not.toContain(passwordHash);
    });

    test('should reject a wrong password', async () => {
      existingUser({ email: EMAIL, password_hash: passwordHash, created_at: '2024-01-01T00:00:00.000Z' });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: EMAIL, password: 'wrong-password-value' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid email or password' });
      expect(response.body.token).toBeUndefined();
    });

    // Regression test: login previously returned 200 for a known email and 201 for an unknown
    // one, which let anyone enumerate registered accounts.
    test('should return an identical response for an unknown email and a wrong password', async () => {
      existingUser(null);
      const unknownEmail = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: PASSWORD });

      existingUser({ email: EMAIL, password_hash: passwordHash, created_at: '2024-01-01T00:00:00.000Z' });
      const wrongPassword = await request(app)
        .post('/api/auth/login')
        .send({ email: EMAIL, password: 'wrong-password-value' });

      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.status).toBe(unknownEmail.status);
      expect(wrongPassword.body).toEqual(unknownEmail.body);
    });

    test('should never create a user as a side effect of logging in', async () => {
      existingUser(null);

      await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: PASSWORD });

      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('should return a generic error when the database fails', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(new Error('Database error'), null));

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: EMAIL, password: PASSWORD });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('GET /api/auth/me', () => {
    const validToken = () =>
      jwt.sign({ sub: EMAIL }, getJwtSecret(), { algorithm: jwtAlgorithm, expiresIn: '1h' });

    test('should return the current user for a valid token', async () => {
      existingUser({ email: EMAIL, created_at: '2024-01-01T00:00:00.000Z' });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${validToken()}`);

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe(EMAIL);
      expect(response.body.user.createdAt).toBe('2024-01-01T00:00:00.000Z');
    });

    test('should return 401 without a token', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Authentication required' });
    });

    test('should return 401 when only x-user-email is supplied', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('x-user-email', EMAIL);

      expect(response.status).toBe(401);
    });

    test('should return 404 if the user no longer exists', async () => {
      existingUser(null);

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${validToken()}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'User not found' });
    });

    test('should handle a database error', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(new Error('Database error'), null));

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${validToken()}`);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });
});
