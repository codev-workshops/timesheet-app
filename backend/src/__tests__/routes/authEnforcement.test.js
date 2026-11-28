const request = require('supertest');
const express = require('express');
const { getDatabase } = require('../../database/init');
const authRoutes = require('../../routes/auth');
const clientRoutes = require('../../routes/clients');
const workEntryRoutes = require('../../routes/workEntries');
const reportRoutes = require('../../routes/reports');
const { errorHandler } = require('../../middleware/errorHandler');

jest.mock('../../database/init');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/work-entries', workEntryRoutes);
app.use('/api/reports', reportRoutes);
app.use(errorHandler);

const protectedEndpoints = [
  ['get', '/api/auth/me'],
  ['get', '/api/clients'],
  ['get', '/api/clients/1'],
  ['post', '/api/clients'],
  ['put', '/api/clients/1'],
  ['delete', '/api/clients/1'],
  ['delete', '/api/clients'],
  ['get', '/api/work-entries'],
  ['get', '/api/work-entries/1'],
  ['post', '/api/work-entries'],
  ['put', '/api/work-entries/1'],
  ['delete', '/api/work-entries/1'],
  ['get', '/api/reports/client/1'],
  ['get', '/api/reports/export/csv/1'],
  ['get', '/api/reports/export/pdf/1']
];

describe('Authentication enforcement on protected routes', () => {
  let mockDb;
  let consoleErrorSpy;

  beforeEach(() => {
    mockDb = {
      get: jest.fn((query, params, callback) => {
        if (query.includes('FROM users')) {
          return callback(null, { email: params[0] });
        }
        return callback(null, { id: 1, name: 'Test Client' });
      }),
      all: jest.fn((query, params, callback) => callback(null, [])),
      run: jest.fn()
    };
    getDatabase.mockReturnValue(mockDb);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe.each(protectedEndpoints)('%s %s', (method, url) => {
    test('should return 401 without x-user-email header and not touch the database', async () => {
      const response = await request(app)[method](url).send({});

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'User email required in x-user-email header' });
      expect(getDatabase).not.toHaveBeenCalled();
    });

    test('should return 400 for malformed x-user-email header and not touch the database', async () => {
      const response = await request(app)[method](url)
        .set('x-user-email', 'not-an-email')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid email format' });
      expect(getDatabase).not.toHaveBeenCalled();
    });
  });

  describe('authenticated requests are scoped to the header email', () => {
    const email = 'alice@example.com';

    test('GET /api/clients queries with the authenticated email', async () => {
      const response = await request(app).get('/api/clients').set('x-user-email', email);

      expect(response.status).toBe(200);
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_email = ?'),
        [email],
        expect.any(Function)
      );
    });

    test('GET /api/work-entries queries with the authenticated email', async () => {
      const response = await request(app).get('/api/work-entries').set('x-user-email', email);

      expect(response.status).toBe(200);
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('WHERE we.user_email = ?'),
        [email],
        expect.any(Function)
      );
    });

    test('GET /api/reports/client/:clientId queries with the authenticated email', async () => {
      const response = await request(app).get('/api/reports/client/1').set('x-user-email', email);

      expect(response.status).toBe(200);
      expect(mockDb.get).toHaveBeenCalledWith(
        'SELECT id, name FROM clients WHERE id = ? AND user_email = ?',
        [1, email],
        expect.any(Function)
      );
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('WHERE client_id = ? AND user_email = ?'),
        [1, email],
        expect.any(Function)
      );
    });
  });
});
