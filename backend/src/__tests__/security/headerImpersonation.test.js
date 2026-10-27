const TEST_SECRET = 'test-jwt-secret-with-at-least-32-characters';
process.env.JWT_SECRET = TEST_SECRET;
process.env.NODE_ENV = 'test';

const express = require('express');
const request = require('supertest');
const { getDatabase } = require('../../database/init');
const { issueToken } = require('../../middleware/auth');
const clientsRouter = require('../../routes/clients');

jest.mock('../../database/init');

describe('Header impersonation regression', () => {
  let mockDb;
  let app;

  beforeEach(() => {
    mockDb = {
      get: jest.fn(),
      all: jest.fn(),
      run: jest.fn()
    };
    getDatabase.mockReturnValue(mockDb);
    app = express();
    app.use('/api/clients', clientsRouter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('x-user-email cannot read or delete clients; a valid token reaches the route', async () => {
    const listResponse = await request(app)
      .get('/api/clients')
      .set('x-user-email', 'victim@example.com');
    const deleteResponse = await request(app)
      .delete('/api/clients')
      .set('x-user-email', 'victim@example.com');

    expect(listResponse.status).toBe(401);
    expect(deleteResponse.status).toBe(401);
    expect(mockDb.all).not.toHaveBeenCalled();
    expect(mockDb.run).not.toHaveBeenCalled();

    mockDb.get.mockImplementation((query, params, callback) => {
      callback(null, { email: 'victim@example.com' });
    });
    mockDb.all.mockImplementation((query, params, callback) => callback(null, []));

    const bearerResponse = await request(app)
      .get('/api/clients')
      .set('Authorization', `Bearer ${issueToken('victim@example.com')}`);

    expect(bearerResponse.status).toBe(200);
    expect(bearerResponse.body).toEqual({ clients: [] });
    expect(mockDb.all).toHaveBeenCalled();
  });
});
