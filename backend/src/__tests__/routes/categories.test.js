const request = require('supertest');
const express = require('express');
const categoryRoutes = require('../../routes/categories');
const { getDatabase } = require('../../database/init');

jest.mock('../../database/init');
jest.mock('../../middleware/auth', () => ({
  authenticateUser: (req, res, next) => {
    req.userEmail = 'test@example.com';
    next();
  }
}));

const app = express();
app.use(express.json());
app.use('/api/categories', categoryRoutes);
app.use((err, req, res, next) => {
  if (err.isJoi) {
    return res.status(400).json({ error: 'Validation error' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

describe('Category Routes', () => {
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

  test('GET / returns categories scoped by user', async () => {
    const categories = [{ id: 1, name: 'Development' }];
    mockDb.all.mockImplementation((query, params, callback) => callback(null, categories));

    const response = await request(app).get('/api/categories');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ categories });
    expect(mockDb.all).toHaveBeenCalledWith(
      expect.stringContaining('WHERE user_email = ? ORDER BY name'),
      ['test@example.com'],
      expect.any(Function)
    );
  });

  test('GET / returns 500 when the query fails', async () => {
    mockDb.all.mockImplementation((query, params, callback) => callback(new Error('failed')));

    const response = await request(app).get('/api/categories');

    expect(response.status).toBe(500);
  });

  test('GET /:id returns a category scoped by user', async () => {
    const category = { id: 1, name: 'Development' };
    mockDb.get.mockImplementation((query, params, callback) => callback(null, category));

    const response = await request(app).get('/api/categories/1');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ category });
    expect(mockDb.get).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = ? AND user_email = ?'),
      [1, 'test@example.com'],
      expect.any(Function)
    );
  });

  test('GET /:id rejects an invalid ID', async () => {
    const response = await request(app).get('/api/categories/invalid');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid category ID' });
  });

  test('GET /:id returns 404 when the category is missing', async () => {
    mockDb.get.mockImplementation((query, params, callback) => callback(null, null));

    const response = await request(app).get('/api/categories/999');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Category not found' });
  });

  test('GET /:id returns 500 when the query fails', async () => {
    mockDb.get.mockImplementation((query, params, callback) => callback(new Error('failed')));

    const response = await request(app).get('/api/categories/1');

    expect(response.status).toBe(500);
  });

  test('POST / creates and returns a category scoped by user', async () => {
    const category = { id: 1, name: 'Development' };
    mockDb.run.mockImplementation(function(query, params, callback) {
      this.lastID = 1;
      callback.call(this, null);
    });
    mockDb.get.mockImplementation((query, params, callback) => callback(null, category));

    const response = await request(app).post('/api/categories').send({ name: 'Development' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      message: 'Category created successfully',
      category
    });
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO categories'),
      ['Development', 'test@example.com'],
      expect.any(Function)
    );
    expect(mockDb.get).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = ? AND user_email = ?'),
      [1, 'test@example.com'],
      expect.any(Function)
    );
  });

  test('POST / returns 400 for invalid category data', async () => {
    const response = await request(app).post('/api/categories').send({});

    expect(response.status).toBe(400);
  });

  test('POST / returns 500 when inserting a category fails', async () => {
    mockDb.run.mockImplementation((query, params, callback) => callback(new Error('failed')));

    const response = await request(app).post('/api/categories').send({ name: 'Development' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to create category' });
  });

  test('POST / returns 500 when retrieving the created category fails', async () => {
    mockDb.run.mockImplementation(function(query, params, callback) {
      this.lastID = 1;
      callback.call(this, null);
    });
    mockDb.get.mockImplementation((query, params, callback) => callback(new Error('failed')));

    const response = await request(app).post('/api/categories').send({ name: 'Development' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Category created but failed to retrieve' });
  });

  test('PUT /:id updates a category scoped by user', async () => {
    const category = { id: 1, name: 'Updated' };
    mockDb.get
      .mockImplementationOnce((query, params, callback) => callback(null, { id: 1 }))
      .mockImplementationOnce((query, params, callback) => callback(null, category));
    mockDb.run.mockImplementation((query, params, callback) => callback(null));

    const response = await request(app).put('/api/categories/1').send({ name: 'Updated' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Category updated successfully', category });
    expect(mockDb.get.mock.calls[0][1]).toEqual([1, 'test@example.com']);
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE categories SET name = ?, updated_at = CURRENT_TIMESTAMP'),
      ['Updated', 1, 'test@example.com'],
      expect.any(Function)
    );
    expect(mockDb.get.mock.calls[1][1]).toEqual([1, 'test@example.com']);
  });

  test('PUT /:id rejects invalid IDs and validation errors', async () => {
    const invalidId = await request(app).put('/api/categories/nope').send({ name: 'Updated' });
    const invalidBody = await request(app).put('/api/categories/1').send({});

    expect(invalidId.status).toBe(400);
    expect(invalidId.body).toEqual({ error: 'Invalid category ID' });
    expect(invalidBody.status).toBe(400);
  });

  test('PUT /:id returns 404 for a category not owned by the user', async () => {
    mockDb.get.mockImplementation((query, params, callback) => callback(null, null));

    const response = await request(app).put('/api/categories/1').send({ name: 'Updated' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Category not found' });
    expect(mockDb.get.mock.calls[0][1]).toEqual([1, 'test@example.com']);
  });

  test('PUT /:id returns 500 for each database error', async () => {
    mockDb.get.mockImplementation((query, params, callback) => callback(new Error('failed')));
    const checkError = await request(app).put('/api/categories/1').send({ name: 'Updated' });
    expect(checkError.status).toBe(500);
    expect(mockDb.get.mock.calls[0][1]).toEqual([1, 'test@example.com']);

    jest.clearAllMocks();
    mockDb.get.mockImplementationOnce((query, params, callback) => callback(null, { id: 1 }));
    mockDb.run.mockImplementation((query, params, callback) => callback(new Error('failed')));
    const updateError = await request(app).put('/api/categories/1').send({ name: 'Updated' });
    expect(updateError.status).toBe(500);
    expect(mockDb.run.mock.calls[0][1]).toEqual(['Updated', 1, 'test@example.com']);

    jest.clearAllMocks();
    mockDb.get
      .mockImplementationOnce((query, params, callback) => callback(null, { id: 1 }))
      .mockImplementationOnce((query, params, callback) => callback(new Error('failed')));
    mockDb.run.mockImplementation((query, params, callback) => callback(null));
    const retrieveError = await request(app).put('/api/categories/1').send({ name: 'Updated' });
    expect(retrieveError.status).toBe(500);
    expect(mockDb.get.mock.calls[1][1]).toEqual([1, 'test@example.com']);
  });

  test('DELETE / removes only the user categories and junction rows', async () => {
    mockDb.run
      .mockImplementationOnce((query, params, callback) => callback(null))
      .mockImplementationOnce(function(query, params, callback) {
        this.changes = 2;
        callback.call(this, null);
      });

    const response = await request(app).delete('/api/categories');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'All categories deleted successfully', deletedCount: 2 });
    expect(mockDb.run.mock.calls[0][0]).toContain('work_entry_categories');
    expect(mockDb.run.mock.calls[0][1]).toEqual(['test@example.com']);
    expect(mockDb.run.mock.calls[1][1]).toEqual(['test@example.com']);
  });

  test('DELETE / returns 500 for junction and category deletion failures', async () => {
    mockDb.run.mockImplementation((query, params, callback) => callback(new Error('failed')));
    const junctionError = await request(app).delete('/api/categories');
    expect(junctionError.status).toBe(500);
    expect(mockDb.run.mock.calls[0][1]).toEqual(['test@example.com']);

    jest.clearAllMocks();
    mockDb.run
      .mockImplementationOnce((query, params, callback) => callback(null))
      .mockImplementationOnce((query, params, callback) => callback(new Error('failed')));
    const deleteError = await request(app).delete('/api/categories');
    expect(deleteError.status).toBe(500);
    expect(mockDb.run.mock.calls[1][1]).toEqual(['test@example.com']);
  });

  test('DELETE /:id deletes links before the user category', async () => {
    mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 1 }));
    mockDb.run
      .mockImplementationOnce((query, params, callback) => callback(null))
      .mockImplementationOnce((query, params, callback) => callback(null));

    const response = await request(app).delete('/api/categories/1');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Category deleted successfully' });
    expect(mockDb.get.mock.calls[0][1]).toEqual([1, 'test@example.com']);
    expect(mockDb.run.mock.calls[0][0]).toContain('DELETE FROM work_entry_categories');
    expect(mockDb.run.mock.calls[0][1]).toEqual([1, 'test@example.com']);
    expect(mockDb.run.mock.calls[1][1]).toEqual([1, 'test@example.com']);
  });

  test('DELETE /:id handles invalid ID, missing category, and existence-query errors', async () => {
    const invalidId = await request(app).delete('/api/categories/invalid');
    expect(invalidId.status).toBe(400);

    mockDb.get.mockImplementation((query, params, callback) => callback(null, null));
    const missing = await request(app).delete('/api/categories/1');
    expect(missing.status).toBe(404);
    expect(mockDb.get.mock.calls[0][1]).toEqual([1, 'test@example.com']);

    jest.clearAllMocks();
    mockDb.get.mockImplementation((query, params, callback) => callback(new Error('failed')));
    const queryError = await request(app).delete('/api/categories/1');
    expect(queryError.status).toBe(500);
    expect(mockDb.get.mock.calls[0][1]).toEqual([1, 'test@example.com']);
  });

  test('DELETE /:id returns 500 for junction and category deletion failures', async () => {
    mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 1 }));
    mockDb.run.mockImplementation((query, params, callback) => callback(new Error('failed')));
    const junctionError = await request(app).delete('/api/categories/1');
    expect(junctionError.status).toBe(500);
    expect(mockDb.run.mock.calls[0][1]).toEqual([1, 'test@example.com']);

    jest.clearAllMocks();
    mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 1 }));
    mockDb.run
      .mockImplementationOnce((query, params, callback) => callback(null))
      .mockImplementationOnce((query, params, callback) => callback(new Error('failed')));
    const deleteError = await request(app).delete('/api/categories/1');
    expect(deleteError.status).toBe(500);
    expect(mockDb.run.mock.calls[1][1]).toEqual([1, 'test@example.com']);
  });
});
