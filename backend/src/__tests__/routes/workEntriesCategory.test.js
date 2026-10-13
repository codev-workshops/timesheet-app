const request = require('supertest');
const express = require('express');
const workEntryRoutes = require('../../routes/workEntries');
const { getDatabase } = require('../../database/init');
const { errorHandler } = require('../../middleware/errorHandler');
const { WORK_ENTRY_CATEGORIES } = require('../../validation/schemas');

jest.mock('../../database/init');
jest.mock('../../middleware/auth', () => ({
  authenticateUser: (req, res, next) => {
    req.userEmail = 'test@example.com';
    next();
  }
}));

const app = express();
app.use(express.json());
app.use('/api/work-entries', workEntryRoutes);
app.use(errorHandler);

describe('Work entry category', () => {
  let mockDb;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    mockDb = {
      all: jest.fn(),
      get: jest.fn(),
      run: jest.fn(function (query, params, callback) {
        this.lastID = 7;
        callback.call(this, null);
      })
    };
    getDatabase.mockReturnValue(mockDb);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  function mockExistingRows(entry) {
    mockDb.get.mockImplementation((query, params, callback) => {
      if (query.includes('FROM clients')) return callback(null, { id: 1 });
      if (query.startsWith('SELECT id FROM work_entries')) return callback(null, { id: 5 });
      return callback(null, { id: 5, client_id: 1, client_name: 'Client A', ...entry });
    });
  }

  const insertCall = () => mockDb.run.mock.calls.find(([q]) => q.startsWith('INSERT INTO work_entries'));
  const updateCall = () => mockDb.run.mock.calls.find(([q]) => q.startsWith('UPDATE work_entries'));

  describe('POST /api/work-entries', () => {
    test.each(WORK_ENTRY_CATEGORIES)('creates an entry with category "%s"', async (category) => {
      mockExistingRows({ hours: 2, date: '2024-01-15', category });

      const response = await request(app)
        .post('/api/work-entries')
        .send({ clientId: 1, hours: 2, date: '2024-01-15', category });

      expect(response.status).toBe(201);
      expect(response.body.workEntry.category).toBe(category);
      const [query, params] = insertCall();
      expect(query).toBe(
        'INSERT INTO work_entries (client_id, user_email, hours, description, date, category) VALUES (?, ?, ?, ?, ?, ?)'
      );
      expect(params[1]).toBe('test@example.com');
      expect(params[5]).toBe(category);
    });

    test('creates an uncategorized entry when category is omitted', async () => {
      mockExistingRows({ hours: 2, date: '2024-01-15', category: null });

      const response = await request(app)
        .post('/api/work-entries')
        .send({ clientId: 1, hours: 2, date: '2024-01-15' });

      expect(response.status).toBe(201);
      expect(response.body.workEntry.category).toBeNull();
      expect(insertCall()[1][5]).toBeNull();
    });

    test('creates an uncategorized entry when category is null', async () => {
      mockExistingRows({ hours: 2, date: '2024-01-15', category: null });

      const response = await request(app)
        .post('/api/work-entries')
        .send({ clientId: 1, hours: 2, date: '2024-01-15', category: null });

      expect(response.status).toBe(201);
      expect(insertCall()[1][5]).toBeNull();
    });

    test('returns the category from the post-insert SELECT', async () => {
      mockExistingRows({ category: 'billable' });

      await request(app)
        .post('/api/work-entries')
        .send({ clientId: 1, hours: 2, date: '2024-01-15', category: 'billable' });

      const selectCall = mockDb.get.mock.calls.find(([q]) => q.includes('JOIN clients'));
      expect(selectCall[0]).toContain('we.category');
    });

    test.each(['vacation', 'Billable', '', 42])('rejects invalid category %p with 400', async (category) => {
      const response = await request(app)
        .post('/api/work-entries')
        .send({ clientId: 1, hours: 2, date: '2024-01-15', category });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(mockDb.run).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/work-entries/:id', () => {
    test('sets a category', async () => {
      mockExistingRows({ category: 'overtime' });

      const response = await request(app).put('/api/work-entries/5').send({ category: 'overtime' });

      expect(response.status).toBe(200);
      expect(response.body.workEntry.category).toBe('overtime');
      const [query, params] = updateCall();
      expect(query).toBe(
        'UPDATE work_entries SET category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?'
      );
      expect(params).toEqual(['overtime', 5, 'test@example.com']);
    });

    test('clears the category with null', async () => {
      mockExistingRows({ category: null });

      const response = await request(app).put('/api/work-entries/5').send({ category: null });

      expect(response.status).toBe(200);
      expect(response.body.workEntry.category).toBeNull();
      const [query, params] = updateCall();
      expect(query).toContain('category = ?');
      expect(params).toEqual([null, 5, 'test@example.com']);
    });

    test('leaves the category untouched when the key is absent', async () => {
      mockExistingRows({ hours: 3, category: 'internal' });

      const response = await request(app).put('/api/work-entries/5').send({ hours: 3 });

      expect(response.status).toBe(200);
      const [query, params] = updateCall();
      expect(query).not.toContain('category');
      expect(params).toEqual([3, 5, 'test@example.com']);
    });

    test.each(['vacation', 'OVERTIME', ''])('rejects invalid category %p with 400', async (category) => {
      const response = await request(app).put('/api/work-entries/5').send({ category });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(mockDb.get).not.toHaveBeenCalled();
      expect(mockDb.run).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/work-entries', () => {
    test('selects category in the list query', async () => {
      const rows = [{ id: 1, category: 'billable' }, { id: 2, category: null }];
      mockDb.all.mockImplementation((query, params, callback) => callback(null, rows));

      const response = await request(app).get('/api/work-entries');

      expect(response.status).toBe(200);
      expect(response.body.workEntries).toEqual(rows);
      expect(mockDb.all.mock.calls[0][0]).toContain('we.category');
    });

    test.each(WORK_ENTRY_CATEGORIES)('filters by category "%s" with a parameterized clause', async (category) => {
      mockDb.all.mockImplementation((query, params, callback) => callback(null, []));

      const response = await request(app).get(`/api/work-entries?category=${category}`);

      expect(response.status).toBe(200);
      const [query, params] = mockDb.all.mock.calls[0];
      expect(query).toContain('WHERE we.user_email = ?');
      expect(query).toContain('AND we.category = ?');
      expect(query).not.toContain(category);
      expect(params).toEqual(['test@example.com', category]);
    });

    test('combines category and clientId filters', async () => {
      mockDb.all.mockImplementation((query, params, callback) => callback(null, []));

      const response = await request(app).get('/api/work-entries?clientId=3&category=internal');

      expect(response.status).toBe(200);
      const [query, params] = mockDb.all.mock.calls[0];
      expect(query).toMatch(/AND we\.client_id = \?\s+AND we\.category = \?/);
      expect(params).toEqual(['test@example.com', 3, 'internal']);
    });

    test.each([
      ['unknown value', 'category=vacation'],
      ['wrong case', 'category=Billable'],
      ['empty string', 'category='],
      ['SQL injection attempt', "category=billable'%20OR%20'1'='1"],
      ['repeated parameter', 'category=billable&category=internal']
    ])('rejects %s with 400', async (label, qs) => {
      const response = await request(app).get(`/api/work-entries?${qs}`);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid category' });
      expect(mockDb.all).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/work-entries/:id', () => {
    test('returns category for a single entry', async () => {
      mockDb.get.mockImplementation((query, params, callback) =>
        callback(null, { id: 5, category: 'non-billable' })
      );

      const response = await request(app).get('/api/work-entries/5');

      expect(response.status).toBe(200);
      expect(response.body.workEntry.category).toBe('non-billable');
      const [query, params] = mockDb.get.mock.calls[0];
      expect(query).toContain('we.category');
      expect(params).toEqual([5, 'test@example.com']);
    });
  });
});
