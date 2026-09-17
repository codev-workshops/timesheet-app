const request = require('supertest');
const express = require('express');
const projectRoutes = require('../../routes/projects');
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
app.use('/api/projects', projectRoutes);
// Add error handler for Joi validation
app.use((err, req, res, next) => {
  if (err.isJoi) {
    return res.status(400).json({ error: 'Validation error' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

const mockProject = {
  id: 1,
  name: 'Website Redesign',
  description: 'Redesign marketing site',
  client_id: 1,
  start_date: '2024-01-15',
  status: 'active',
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
  client_name: 'Acme Corp'
};

describe('Project Routes', () => {
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

  describe('GET /api/projects', () => {
    test('should return all projects for authenticated user', async () => {
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, [mockProject]);
      });

      const response = await request(app).get('/api/projects');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ projects: [mockProject] });
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('JOIN clients c ON p.client_id = c.id'),
        ['test@example.com'],
        expect.any(Function)
      );
      expect(mockDb.all.mock.calls[0][0]).toContain('ORDER BY p.created_at DESC');
    });

    test('should filter by clientId', async () => {
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, [mockProject]);
      });

      const response = await request(app).get('/api/projects?clientId=1');

      expect(response.status).toBe(200);
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('AND p.client_id = ?'),
        ['test@example.com', 1],
        expect.any(Function)
      );
    });

    test('should return 400 for invalid clientId filter', async () => {
      const response = await request(app).get('/api/projects?clientId=abc');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid client ID' });
      expect(mockDb.all).not.toHaveBeenCalled();
    });

    test('should return empty array when no projects exist', async () => {
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, []);
      });

      const response = await request(app).get('/api/projects');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ projects: [] });
    });

    test('should handle database error', async () => {
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app).get('/api/projects');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('GET /api/projects/:id', () => {
    test('should return specific project', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, mockProject);
      });

      const response = await request(app).get('/api/projects/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ project: mockProject });
      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('WHERE p.id = ? AND p.user_email = ?'),
        [1, 'test@example.com'],
        expect.any(Function)
      );
    });

    test('should return 404 if project not found', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null);
      });

      const response = await request(app).get('/api/projects/999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Project not found' });
    });

    test('should return 400 for invalid project ID', async () => {
      const response = await request(app).get('/api/projects/invalid');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid project ID' });
    });

    test('should handle database error', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app).get('/api/projects/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('POST /api/projects', () => {
    const newProject = {
      name: 'Website Redesign',
      description: 'Redesign marketing site',
      clientId: 1,
      startDate: '2024-01-15',
      status: 'active'
    };

    test('should create new project with valid data', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation(function(query, params, callback) {
        this.lastID = 1;
        callback.call(this, null);
      });

      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, mockProject);
      });

      const response = await request(app)
        .post('/api/projects')
        .send(newProject);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Project created successfully');
      expect(response.body.project).toEqual(mockProject);
      expect(mockDb.get).toHaveBeenNthCalledWith(
        1,
        'SELECT id FROM clients WHERE id = ? AND user_email = ?',
        [1, 'test@example.com'],
        expect.any(Function)
      );
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO projects'),
        ['Website Redesign', 'Redesign marketing site', 1, '2024-01-15', 'active', 'test@example.com'],
        expect.any(Function)
      );
    });

    test('should default status to active and null optional fields', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation(function(query, params, callback) {
        this.lastID = 1;
        callback.call(this, null);
      });

      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { ...mockProject, description: null, start_date: null });
      });

      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'Minimal', clientId: 1 });

      expect(response.status).toBe(201);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO projects'),
        ['Minimal', null, 1, null, 'active', 'test@example.com'],
        expect.any(Function)
      );
    });

    test('should return 400 for missing name', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({ clientId: 1 });

      expect(response.status).toBe(400);
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    test('should return 400 for missing clientId', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'No Client' });

      expect(response.status).toBe(400);
    });

    test('should return 400 for invalid status', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'Bad Status', clientId: 1, status: 'archived' });

      expect(response.status).toBe(400);
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    test('should return 400 for invalid startDate', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'Bad Date', clientId: 1, startDate: 'not-a-date' });

      expect(response.status).toBe(400);
    });

    test('should return 400 if client does not belong to user', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null);
      });

      const response = await request(app)
        .post('/api/projects')
        .send(newProject);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Client not found or does not belong to user' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('should handle database error on client lookup', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app)
        .post('/api/projects')
        .send(newProject);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('should handle database insert error', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(new Error('Insert failed'));
      });

      const response = await request(app)
        .post('/api/projects')
        .send(newProject);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to create project' });
    });

    test('should handle database error on retrieve after insert', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation(function(query, params, callback) {
        this.lastID = 1;
        callback.call(this, null);
      });

      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app)
        .post('/api/projects')
        .send(newProject);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Project created but failed to retrieve' });
    });
  });

  describe('PUT /api/projects/:id', () => {
    test('should update project fields', async () => {
      const updated = { ...mockProject, name: 'Renamed', status: 'completed' };

      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });

      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, updated);
      });

      const response = await request(app)
        .put('/api/projects/1')
        .send({ name: 'Renamed', status: 'completed' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Project updated successfully');
      expect(response.body.project).toEqual(updated);
      expect(mockDb.run).toHaveBeenCalledWith(
        'UPDATE projects SET name = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?',
        ['Renamed', 'completed', 1, 'test@example.com'],
        expect.any(Function)
      );
    });

    test('should verify new client ownership when clientId is updated', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { id: 1 });
      });
      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { id: 2 });
      });
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });
      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { ...mockProject, client_id: 2 });
      });

      const response = await request(app)
        .put('/api/projects/1')
        .send({ clientId: 2 });

      expect(response.status).toBe(200);
      expect(mockDb.get).toHaveBeenNthCalledWith(
        2,
        'SELECT id FROM clients WHERE id = ? AND user_email = ?',
        [2, 'test@example.com'],
        expect.any(Function)
      );
      expect(mockDb.run).toHaveBeenCalledWith(
        'UPDATE projects SET client_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?',
        [2, 1, 'test@example.com'],
        expect.any(Function)
      );
    });

    test('should return 400 if new client does not belong to user', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { id: 1 });
      });
      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, null);
      });

      const response = await request(app)
        .put('/api/projects/1')
        .send({ clientId: 99 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Client not found or does not belong to user' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('should clear description and start date when empty values provided', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { id: 1 });
      });
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });
      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { ...mockProject, description: null, start_date: null });
      });

      const response = await request(app)
        .put('/api/projects/1')
        .send({ description: '', startDate: '' });

      expect(response.status).toBe(200);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('description = ?, start_date = ?'),
        [null, null, 1, 'test@example.com'],
        expect.any(Function)
      );
    });

    test('should return 400 for empty update body', async () => {
      const response = await request(app)
        .put('/api/projects/1')
        .send({});

      expect(response.status).toBe(400);
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    test('should return 400 for invalid status', async () => {
      const response = await request(app)
        .put('/api/projects/1')
        .send({ status: 'cancelled' });

      expect(response.status).toBe(400);
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    test('should return 400 for invalid project ID', async () => {
      const response = await request(app)
        .put('/api/projects/invalid')
        .send({ name: 'X' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid project ID' });
    });

    test('should return 404 if project not found', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null);
      });

      const response = await request(app)
        .put('/api/projects/999')
        .send({ name: 'X' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Project not found' });
    });

    test('should handle database error on existence check', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app)
        .put('/api/projects/1')
        .send({ name: 'X' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('should handle database update error', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { id: 1 });
      });
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(new Error('Update failed'));
      });

      const response = await request(app)
        .put('/api/projects/1')
        .send({ name: 'X' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to update project' });
    });

    test('should handle database error on retrieve after update', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { id: 1 });
      });
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });
      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app)
        .put('/api/projects/1')
        .send({ name: 'X' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Project updated but failed to retrieve' });
    });
  });

  describe('DELETE /api/projects/:id', () => {
    test('should delete project', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1 });
      });
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });

      const response = await request(app).delete('/api/projects/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Project deleted successfully' });
      expect(mockDb.run).toHaveBeenCalledWith(
        'DELETE FROM projects WHERE id = ? AND user_email = ?',
        [1, 'test@example.com'],
        expect.any(Function)
      );
    });

    test('should return 400 for invalid project ID', async () => {
      const response = await request(app).delete('/api/projects/invalid');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid project ID' });
    });

    test('should return 404 if project not found', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null);
      });

      const response = await request(app).delete('/api/projects/999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Project not found' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('should handle database error on existence check', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app).delete('/api/projects/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('should handle database delete error', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1 });
      });
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(new Error('Delete failed'));
      });

      const response = await request(app).delete('/api/projects/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to delete project' });
    });
  });
});
