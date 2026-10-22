const request = require('supertest');
const express = require('express');
const { getDatabase } = require('../../database/init');

jest.mock('../../database/init');

const categoryRoutes = require('../../routes/categories');

const app = express();
app.use(express.json());
app.use('/api/categories', categoryRoutes);

describe('Category Routes Authentication', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      all: jest.fn(),
      get: jest.fn(),
      run: jest.fn()
    };
    getDatabase.mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should return 401 when x-user-email header is missing', async () => {
    const response = await request(app).get('/api/categories');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 'User email required in x-user-email header'
    });
  });

  test('should return 400 for invalid email header', async () => {
    const response = await request(app)
      .get('/api/categories')
      .set('x-user-email', 'not-an-email');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid email format' });
  });
});
