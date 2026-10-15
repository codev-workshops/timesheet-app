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
// Add error handler for Joi validation
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

  describe('GET /api/categories', () => {
    test('should return all categories for authenticated user', async () => {
      const mockCategories = [
        { id: 1, name: 'Category A', description: 'Desc A', color: '#FF0000', created_at: '2024-01-01', updated_at: '2024-01-01' },
        { id: 2, name: 'Category B', description: 'Desc B', color: '#00FF00', created_at: '2024-01-02', updated_at: '2024-01-02' }
      ];

      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, mockCategories);
      });

      const response = await request(app).get('/api/categories');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ categories: mockCategories });
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY name'),
        ['test@example.com'],
        expect.any(Function)
      );
    });

    test('should return empty array when no categories exist', async () => {
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, []);
      });

      const response = await request(app).get('/api/categories');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ categories: [] });
    });

    test('should handle database error', async () => {
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app).get('/api/categories');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('GET /api/categories/:id', () => {
    test('should return specific category', async () => {
      const mockCategory = { id: 1, name: 'Category A', description: 'Desc A', color: '#FF0000' };

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, mockCategory);
      });

      const response = await request(app).get('/api/categories/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ category: mockCategory });
    });

    test('should return 400 for invalid category ID', async () => {
      const response = await request(app).get('/api/categories/invalid');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid category ID' });
    });

    test('should return 404 if category not found or belongs to another user', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null);
      });

      const response = await request(app).get('/api/categories/1');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Category not found' });
      expect(mockDb.get).toHaveBeenCalledWith(
        expect.any(String),
        [1, 'test@example.com'],
        expect.any(Function)
      );
    });

    test('should handle database error', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app).get('/api/categories/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('POST /api/categories', () => {
    test('should create new category with valid data', async () => {
      const newCategory = { name: 'New Category', description: 'Desc', color: '#FF0000' };
      const createdCategory = { id: 1, ...newCategory, created_at: '2024-01-01', updated_at: '2024-01-01' };

      mockDb.run.mockImplementation(function(query, params, callback) {
        this.lastID = 1;
        callback.call(this, null);
      });

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, createdCategory);
      });

      const response = await request(app)
        .post('/api/categories')
        .send(newCategory);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Category created successfully');
      expect(response.body.category).toEqual(createdCategory);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO categories (name, description, color, user_email)'),
        ['New Category', 'Desc', '#FF0000', 'test@example.com'],
        expect.any(Function)
      );
    });

    test('should store null for empty description and color', async () => {
      mockDb.run.mockImplementation(function(query, params, callback) {
        this.lastID = 1;
        callback.call(this, null);
      });

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1, name: 'Category', description: null, color: null });
      });

      const response = await request(app)
        .post('/api/categories')
        .send({ name: 'Category' });

      expect(response.status).toBe(201);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.any(String),
        ['Category', null, null, 'test@example.com'],
        expect.any(Function)
      );
    });

    test('should return 400 for missing name', async () => {
      const response = await request(app)
        .post('/api/categories')
        .send({ description: 'No name' });

      expect(response.status).toBe(400);
    });

    test('should return 400 for invalid color', async () => {
      const response = await request(app)
        .post('/api/categories')
        .send({ name: 'Category', color: 'red' });

      expect(response.status).toBe(400);
    });

    test('should return 400 for incomplete hex color', async () => {
      const response = await request(app)
        .post('/api/categories')
        .send({ name: 'Category', color: '#12345' });

      expect(response.status).toBe(400);
    });

    test('should return 409 on unique constraint violation', async () => {
      mockDb.run.mockImplementation((query, params, callback) => {
        callback({ code: 'SQLITE_CONSTRAINT', message: 'SQLITE_CONSTRAINT: UNIQUE constraint failed: categories.user_email, categories.name' });
      });

      const response = await request(app)
        .post('/api/categories')
        .send({ name: 'Duplicate' });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: 'Category name already exists' });
    });

    test('should return 500 on generic insert error', async () => {
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(new Error('Insert failed'));
      });

      const response = await request(app)
        .post('/api/categories')
        .send({ name: 'Category' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to create category' });
    });

    test('should handle error retrieving category after creation', async () => {
      mockDb.run.mockImplementation(function(query, params, callback) {
        this.lastID = 1;
        callback.call(this, null);
      });

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('Retrieval failed'), null);
      });

      const response = await request(app)
        .post('/api/categories')
        .send({ name: 'Category' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Category created but failed to retrieve' });
    });
  });

  describe('PUT /api/categories/:id', () => {
    test('should update category with valid data', async () => {
      const updatedCategory = { id: 1, name: 'Updated', description: 'Desc', color: '#00FF00' };

      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });

      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, updatedCategory);
      });

      const response = await request(app)
        .put('/api/categories/1')
        .send({ name: 'Updated', color: '#00FF00' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Category updated successfully');
      expect(response.body.category).toEqual(updatedCategory);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE categories SET .*updated_at = CURRENT_TIMESTAMP.*WHERE id = \? AND user_email = \?/),
        expect.arrayContaining([1, 'test@example.com']),
        expect.any(Function)
      );
    });

    test('should return 400 for invalid category ID', async () => {
      const response = await request(app)
        .put('/api/categories/invalid')
        .send({ name: 'Updated' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid category ID' });
    });

    test('should return 400 for empty update', async () => {
      const response = await request(app)
        .put('/api/categories/1')
        .send({});

      expect(response.status).toBe(400);
    });

    test('should return 404 if category belongs to another user', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        expect(params).toEqual([1, 'test@example.com']);
        callback(null, null);
      });

      const response = await request(app)
        .put('/api/categories/1')
        .send({ name: 'Updated' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Category not found' });
    });

    test('should return 409 on duplicate name', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback({ code: 'SQLITE_CONSTRAINT', message: 'SQLITE_CONSTRAINT: UNIQUE constraint failed: categories.user_email, categories.name' });
      });

      const response = await request(app)
        .put('/api/categories/1')
        .send({ name: 'Duplicate' });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: 'Category name already exists' });
    });

    test('should handle database error when checking category existence', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app)
        .put('/api/categories/1')
        .send({ name: 'Updated' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('should handle database error during update', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(new Error('Update failed'));
      });

      const response = await request(app)
        .put('/api/categories/1')
        .send({ name: 'Updated' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to update category' });
    });

    test('should handle error retrieving category after update', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });

      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(new Error('Retrieval failed'), null);
      });

      const response = await request(app)
        .put('/api/categories/1')
        .send({ name: 'Updated' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Category updated but failed to retrieve' });
    });
  });

  describe('DELETE /api/categories/:id', () => {
    test('should delete category and null out work entry categories', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });

      const response = await request(app).delete('/api/categories/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Category deleted successfully' });

      expect(mockDb.run).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('UPDATE work_entries SET category_id = NULL'),
        [1, 'test@example.com'],
        expect.any(Function)
      );
      expect(mockDb.run.mock.calls[0][0]).toContain('WHERE category_id = ? AND user_email = ?');
      expect(mockDb.run).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('DELETE FROM categories WHERE id = ? AND user_email = ?'),
        [1, 'test@example.com'],
        expect.any(Function)
      );
    });

    test('should return 400 for invalid category ID', async () => {
      const response = await request(app).delete('/api/categories/invalid');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid category ID' });
    });

    test('should return 404 if category belongs to another user', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        expect(params).toEqual([1, 'test@example.com']);
        callback(null, null);
      });

      const response = await request(app).delete('/api/categories/1');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Category not found' });
    });

    test('should handle database error when checking category existence', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app).delete('/api/categories/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('should handle error clearing work entry categories and not delete', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(new Error('Update failed'));
      });

      const response = await request(app).delete('/api/categories/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to delete category' });
      expect(mockDb.run).toHaveBeenCalledTimes(1);
      expect(mockDb.run.mock.calls[0][0]).toContain('UPDATE work_entries');
    });

    test('should handle database error on delete', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run
        .mockImplementationOnce((query, params, callback) => {
          callback(null);
        })
        .mockImplementationOnce((query, params, callback) => {
          callback(new Error('Delete failed'));
        });

      const response = await request(app).delete('/api/categories/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to delete category' });
    });
  });

  describe('DELETE /api/categories', () => {
    test('should delete all categories and null out work entry categories', async () => {
      mockDb.run
        .mockImplementationOnce((query, params, callback) => {
          callback(null);
        })
        .mockImplementationOnce(function(query, params, callback) {
          this.changes = 3;
          callback.call(this, null);
        });

      const response = await request(app).delete('/api/categories');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'All categories deleted successfully', deletedCount: 3 });

      expect(mockDb.run).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('UPDATE work_entries SET category_id = NULL'),
        ['test@example.com'],
        expect.any(Function)
      );
      expect(mockDb.run.mock.calls[0][0]).toContain('WHERE user_email = ? AND category_id IS NOT NULL');
      expect(mockDb.run).toHaveBeenNthCalledWith(
        2,
        'DELETE FROM categories WHERE user_email = ?',
        ['test@example.com'],
        expect.any(Function)
      );
    });

    test('should handle database error clearing work entry categories', async () => {
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(new Error('Update failed'));
      });

      const response = await request(app).delete('/api/categories');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to delete categories' });
      expect(mockDb.run).toHaveBeenCalledTimes(1);
    });

    test('should handle database error on delete', async () => {
      mockDb.run
        .mockImplementationOnce((query, params, callback) => {
          callback(null);
        })
        .mockImplementationOnce((query, params, callback) => {
          callback(new Error('Delete failed'));
        });

      const response = await request(app).delete('/api/categories');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to delete categories' });
    });
  });
});
