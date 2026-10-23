const request = require('supertest');
const express = require('express');
const { getDatabase } = require('../../database/init');
const { predictHours } = require('../../ml/predict');
const { errorHandler } = require('../../middleware/errorHandler');

jest.mock('../../database/init');
jest.mock('../../ml/predict', () => ({ predictHours: jest.fn() }), { virtual: true });

const predictionRoutes = require('../../routes/predictions');

const app = express();
app.use(express.json());
app.use('/api/predictions', predictionRoutes);
app.use(errorHandler);

describe('Prediction Routes', () => {
  let mockDb;
  const email = 'test@example.com';

  beforeEach(() => {
    mockDb = { get: jest.fn() };
    getDatabase.mockReturnValue(mockDb);
    mockDb.get.mockImplementation((query, params, callback) => {
      if (query.includes('SELECT email FROM users')) {
        callback(null, { email });
      } else {
        callback(null, { id: 1, department: 'Engineering' });
      }
    });
    predictHours.mockReturnValue(3.5);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('returns 401 without the user email header', async () => {
    const response = await request(app).post('/api/predictions').send({ clientId: 1 });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'User email required in x-user-email header' });
  });

  test('returns 400 for an invalid user email header', async () => {
    const response = await request(app)
      .post('/api/predictions')
      .set('x-user-email', 'invalid-email')
      .send({ clientId: 1 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid email format' });
  });

  test('returns 400 when clientId is missing', async () => {
    const response = await request(app)
      .post('/api/predictions')
      .set('x-user-email', email)
      .send({});

    expect(response.status).toBe(400);
  });

  test('returns 400 for an invalid date', async () => {
    const response = await request(app)
      .post('/api/predictions')
      .set('x-user-email', email)
      .send({ clientId: 1, date: 'not-a-date' });

    expect(response.status).toBe(400);
  });

  test('returns 400 when the client does not belong to the user', async () => {
    mockDb.get.mockImplementation((query, params, callback) => {
      if (query.includes('SELECT email FROM users')) {
        callback(null, { email });
      } else {
        callback(null, null);
      }
    });

    const response = await request(app)
      .post('/api/predictions')
      .set('x-user-email', email)
      .send({ clientId: 4 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Client not found or does not belong to user' });
    expect(predictHours).not.toHaveBeenCalled();
  });

  test('returns 500 when the client query fails', async () => {
    mockDb.get.mockImplementation((query, params, callback) => {
      if (query.includes('SELECT email FROM users')) {
        callback(null, { email });
      } else {
        callback(new Error('Database error'));
      }
    });

    const response = await request(app)
      .post('/api/predictions')
      .set('x-user-email', email)
      .send({ clientId: 1 });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });

  test('returns predicted hours using the client department and user-scoped query', async () => {
    const response = await request(app)
      .post('/api/predictions')
      .set('x-user-email', email)
      .send({ clientId: 7, description: 'Feature work', date: '2024-01-15' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ predictedHours: 3.5 });
    expect(mockDb.get).toHaveBeenLastCalledWith(
      'SELECT id, department FROM clients WHERE id = ? AND user_email = ?',
      [7, email],
      expect.any(Function)
    );
    expect(predictHours).toHaveBeenCalledWith({
      clientId: 7,
      department: 'Engineering',
      description: 'Feature work',
      date: new Date('2024-01-15')
    });
  });

  test('defaults an omitted date to the current date', async () => {
    const beforeRequest = new Date();
    await request(app)
      .post('/api/predictions')
      .set('x-user-email', email)
      .send({ clientId: 1 });
    const afterRequest = new Date();

    expect(predictHours).toHaveBeenCalledWith({
      clientId: 1,
      department: 'Engineering',
      description: '',
      date: expect.any(Date)
    });
    const { date } = predictHours.mock.calls[0][0];
    expect(date.getTime()).toBeGreaterThanOrEqual(beforeRequest.getTime());
    expect(date.getTime()).toBeLessThanOrEqual(afterRequest.getTime());
  });
});
