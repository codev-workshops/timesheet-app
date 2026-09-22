// Route tests mock authenticateUser; this suite mounts the real middleware in
// front of the real routers so the auth contract is verified end-to-end.
const request = require('supertest');
const express = require('express');
const { getDatabase } = require('../../database/init');
const clientRoutes = require('../../routes/clients');
const workEntryRoutes = require('../../routes/workEntries');
const reportRoutes = require('../../routes/reports');
const { errorHandler } = require('../../middleware/errorHandler');

jest.mock('../../database/init');

const app = express();
app.use(express.json());
app.use('/api/clients', clientRoutes);
app.use('/api/work-entries', workEntryRoutes);
app.use('/api/reports', reportRoutes);
app.use(errorHandler);

describe('Authentication integration (real middleware + routers)', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = { all: jest.fn(), get: jest.fn(), run: jest.fn() };
    getDatabase.mockReturnValue(mockDb);
  });

  afterEach(() => jest.clearAllMocks());

  test.each([
    ['get', '/api/clients'],
    ['post', '/api/clients'],
    ['delete', '/api/clients'],
    ['get', '/api/work-entries'],
    ['post', '/api/work-entries'],
    ['get', '/api/reports/client/1'],
    ['get', '/api/reports/export/csv/1'],
    ['get', '/api/reports/export/pdf/1']
  ])('%s %s returns 401 without x-user-email and never touches the DB', async (method, url) => {
    const response = await request(app)[method](url).send({});

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'User email required in x-user-email header' });
    expect(mockDb.all).not.toHaveBeenCalled();
    expect(mockDb.get).not.toHaveBeenCalled();
    expect(mockDb.run).not.toHaveBeenCalled();
  });

  test('returns 400 for a malformed x-user-email header', async () => {
    const response = await request(app).get('/api/clients').set('x-user-email', 'nope');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid email format' });
    expect(mockDb.get).not.toHaveBeenCalled();
  });

  test('auto-provisions an unknown user then scopes the route query to that email', async () => {
    mockDb.get
      .mockImplementationOnce((q, p, cb) => cb(null, undefined)) // users lookup
    ;
    mockDb.run.mockImplementation((q, p, cb) => cb(null)); // INSERT INTO users
    mockDb.all.mockImplementation((q, p, cb) => cb(null, []));

    const response = await request(app).get('/api/clients').set('x-user-email', 'new@example.com');

    expect(response.status).toBe(200);
    expect(mockDb.get).toHaveBeenCalledWith(
      'SELECT email FROM users WHERE email = ?',
      ['new@example.com'],
      expect.any(Function)
    );
    expect(mockDb.run).toHaveBeenCalledWith(
      'INSERT INTO users (email) VALUES (?)',
      ['new@example.com'],
      expect.any(Function)
    );
    expect(mockDb.all).toHaveBeenCalledWith(
      expect.stringContaining('WHERE user_email = ?'),
      ['new@example.com'],
      expect.any(Function)
    );
  });

  test('existing user passes straight through to the route with req.userEmail set', async () => {
    mockDb.get.mockImplementationOnce((q, p, cb) => cb(null, { email: 'known@example.com' }));
    mockDb.all.mockImplementation((q, p, cb) => cb(null, [{ id: 1, name: 'C' }]));

    const response = await request(app).get('/api/work-entries').set('x-user-email', 'known@example.com');

    expect(response.status).toBe(200);
    expect(mockDb.run).not.toHaveBeenCalled();
    expect(mockDb.all).toHaveBeenCalledWith(
      expect.stringContaining('WHERE we.user_email = ?'),
      ['known@example.com'],
      expect.any(Function)
    );
  });

  test('Joi validation failures surface as 400 through the real errorHandler', async () => {
    mockDb.get.mockImplementationOnce((q, p, cb) => cb(null, { email: 'known@example.com' }));

    const response = await request(app)
      .post('/api/clients')
      .set('x-user-email', 'known@example.com')
      .send({ name: '' });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
    expect(mockDb.run).not.toHaveBeenCalled();
  });
});
