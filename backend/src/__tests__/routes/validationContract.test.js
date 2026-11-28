const request = require('supertest');
const express = require('express');
const { getDatabase } = require('../../database/init');
const authRoutes = require('../../routes/auth');
const clientRoutes = require('../../routes/clients');
const workEntryRoutes = require('../../routes/workEntries');
const { errorHandler } = require('../../middleware/errorHandler');

jest.mock('../../database/init');
jest.mock('../../middleware/auth', () => ({
  authenticateUser: (req, res, next) => {
    req.userEmail = 'test@example.com';
    next();
  }
}));

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/work-entries', workEntryRoutes);
app.use(errorHandler);

const invalidRequests = [
  ['post', '/api/auth/login', { email: 'not-an-email' }, '"email" must be a valid email'],
  ['post', '/api/clients', {}, '"name" is required'],
  ['post', '/api/clients', { name: 'Acme', email: 'bad' }, '"email" must be a valid email'],
  ['put', '/api/clients/1', {}, '"value" must have at least 1 key'],
  ['post', '/api/work-entries', { clientId: 1, hours: 25, date: '2024-01-01' }, '"hours" must be less than or equal to 24'],
  ['post', '/api/work-entries', { hours: 2, date: '2024-01-01' }, '"clientId" is required'],
  ['put', '/api/work-entries/1', {}, '"value" must have at least 1 key']
];

describe('Validation error contract with the real errorHandler', () => {
  let mockDb;
  let consoleErrorSpy;

  beforeEach(() => {
    mockDb = {
      get: jest.fn(),
      all: jest.fn(),
      run: jest.fn()
    };
    getDatabase.mockReturnValue(mockDb);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  test.each(invalidRequests)(
    '%s %s with %j returns 400 { error, details } and performs no DB access',
    async (method, url, body, expectedDetail) => {
      const response = await request(app)[method](url).send(body);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Validation error',
        details: [expectedDetail]
      });
      expect(mockDb.get).not.toHaveBeenCalled();
      expect(mockDb.all).not.toHaveBeenCalled();
      expect(mockDb.run).not.toHaveBeenCalled();
    }
  );
});
