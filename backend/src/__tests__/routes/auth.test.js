const request = require('supertest');
const { createApp, USER } = require('../helpers/app');
const { db, resetDatabase, insertUsers, breakTable, failOn, ignoreInsertsOn } = require('../helpers/db');

const app = createApp();

describe('Auth Routes', () => {
  const ORIGINAL_ADMIN_EMAILS = process.env.ADMIN_EMAILS;

  beforeEach(async () => {
    delete process.env.ADMIN_EMAILS;
    await resetDatabase();
  });

  afterAll(() => {
    if (ORIGINAL_ADMIN_EMAILS === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS;
  });

  describe('POST /api/auth/login', () => {
    test('logs in an existing user (200)', async () => {
      await db('users').insert({ email: USER, created_at: '2024-01-01 00:00:00' });

      const res = await request(app).post('/api/auth/login').send({ email: USER });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        message: 'Login successful',
        user: { email: USER, createdAt: '2024-01-01 00:00:00', isAdmin: false }
      });
      expect(await db('users')).toHaveLength(1);
    });

    test('creates a new user on first login (201)', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: 'new@example.com' });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('User created and logged in successfully');
      expect(res.body.user.email).toBe('new@example.com');
      expect(res.body.user.isAdmin).toBe(false);
      expect(new Date(res.body.user.createdAt).toString()).not.toBe('Invalid Date');
      expect(await db('users').where({ email: 'new@example.com' }).first()).toBeDefined();
    });

    test('returns 400 for invalid email', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: 'invalid-email' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
      expect(res.body.details).toEqual([expect.stringContaining('email')]);
      expect(await db('users')).toHaveLength(0);
    });

    test('returns 400 for missing email', async () => {
      const res = await request(app).post('/api/auth/login').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
    });

    test('reports isAdmin for admins on login (existing and new users)', async () => {
      process.env.ADMIN_EMAILS = `${USER},new-admin@example.com`;
      await insertUsers(USER);

      let res = await request(app).post('/api/auth/login').send({ email: USER });
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ email: USER, isAdmin: true });

      res = await request(app).post('/api/auth/login').send({ email: 'new-admin@example.com' });
      expect(res.status).toBe(201);
      expect(res.body.user).toMatchObject({ email: 'new-admin@example.com', isAdmin: true });
    });

    test('returns 500 when user lookup fails', async () => {
      await breakTable('users');
      const res = await request(app).post('/api/auth/login').send({ email: USER });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
      expect(console.error).toHaveBeenCalled();
    });

    test('returns 500 Failed to create user when insert fails', async () => {
      await failOn('users', 'INSERT');
      const res = await request(app).post('/api/auth/login').send({ email: 'new@example.com' });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to create user' });
    });
  });

  describe('GET /api/auth/me', () => {
    test('returns current user info', async () => {
      await db('users').insert({ email: USER, created_at: '2024-01-01 00:00:00' });

      const res = await request(app).get('/api/auth/me').set('x-user-email', USER);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ user: { email: USER, createdAt: '2024-01-01 00:00:00', isAdmin: false } });
    });

    test('reports isAdmin true for an ADMIN_EMAILS member', async () => {
      process.env.ADMIN_EMAILS = 'boss@example.com, ' + USER.toUpperCase();
      const res = await request(app).get('/api/auth/me').set('x-user-email', USER);
      expect(res.status).toBe(200);
      expect(res.body.user.isAdmin).toBe(true);
    });

    test('auto-creates the user via middleware on first call', async () => {
      const res = await request(app).get('/api/auth/me').set('x-user-email', 'fresh@example.com');
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('fresh@example.com');
      expect(res.body.user.createdAt).toBeTruthy();
    });

    test('returns 401 if no email header provided', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'User email required in x-user-email header' });
    });

    test('returns 404 if user row does not exist after authentication', async () => {
      await ignoreInsertsOn('users');
      const res = await request(app).get('/api/auth/me').set('x-user-email', 'ghost@example.com');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'User not found' });
    });

    test('returns 500 when the users table is unavailable', async () => {
      await insertUsers(USER);
      await breakTable('users');
      const res = await request(app).get('/api/auth/me').set('x-user-email', USER);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });
  });

  test('unknown route returns 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Route not found' });
  });
});
