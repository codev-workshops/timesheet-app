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

describe('Project Routes', () => {
  let mockDb;

  const mockProject = {
    id: 1,
    name: 'Project A',
    description: 'Desc A',
    client_id: 1,
    start_date: '2024-01-01',
    status: 'active',
    client_name: 'Client A',
    created_at: '2024-01-01',
    updated_at: '2024-01-01'
  };

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
      const mockProjects = [mockProject, { ...mockProject, id: 2, name: 'Project B' }];

      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, mockProjects);
      });

      const response = await request(app).get('/api/projects');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ projects: mockProjects });
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('p.user_email = ?'),
        ['test@example.com'],
        expect.any(Function)
      );
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
        expect.stringContaining('p.id = ? AND p.user_email = ?'),
        [1, 'test@example.com'],
        expect.any(Function)
      );
    });

    test('should return 400 for invalid project ID', async () => {
      const response = await request(app).get('/api/projects/invalid');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid project ID' });
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    test('should return 404 if project not found', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null);
      });

      const response = await request(app).get('/api/projects/999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Project not found' });
    });
  });

  describe('POST /api/projects', () => {
    test('should create new project with valid data', async () => {
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 1 }))
        .mockImplementationOnce((query, params, callback) => callback(null, mockProject));

      mockDb.run.mockImplementation(function(query, params, callback) {
        callback.call({ lastID: 1 }, null);
      });

      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'Project A', description: 'Desc A', clientId: 1, startDate: '2024-01-01', status: 'active' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ message: 'Project created successfully', project: mockProject });
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO projects'),
        ['Project A', 'Desc A', 1, '2024-01-01', 'active', 'test@example.com'],
        expect.any(Function)
      );
    });

    test('should default status to active', async () => {
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 1 }))
        .mockImplementationOnce((query, params, callback) => callback(null, mockProject));

      mockDb.run.mockImplementation(function(query, params, callback) {
        callback.call({ lastID: 1 }, null);
      });

      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'Project A', clientId: 1 });

      expect(response.status).toBe(201);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.any(String),
        ['Project A', null, 1, null, 'active', 'test@example.com'],
        expect.any(Function)
      );
    });

    test('should return 400 for missing name', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({ clientId: 1 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Validation error' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('should return 400 for invalid status', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'Project A', clientId: 1, status: 'archived' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Validation error' });
    });

    test('should return 400 if client does not belong to user', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, null));

      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'Project A', clientId: 99 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Client not found or does not belong to user' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/projects/:id', () => {
    test('should update project', async () => {
      const updatedProject = { ...mockProject, name: 'Updated', status: 'completed' };

      mockDb.run.mockImplementation(function(query, params, callback) {
        callback.call({ changes: 1 }, null);
      });
      mockDb.get.mockImplementation((query, params, callback) => callback(null, updatedProject));

      const response = await request(app)
        .put('/api/projects/1')
        .send({ name: 'Updated', status: 'completed' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Project updated successfully', project: updatedProject });
      expect(mockDb.run).toHaveBeenCalledWith(
        'UPDATE projects SET name = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?',
        ['Updated', 'completed', 1, 'test@example.com'],
        expect.any(Function)
      );
    });

    test('should clear description and start date', async () => {
      mockDb.run.mockImplementation(function(query, params, callback) {
        callback.call({ changes: 1 }, null);
      });
      const clearedProject = { ...mockProject, description: null, start_date: null };
      mockDb.get.mockImplementation((query, params, callback) => callback(null, clearedProject));

      const response = await request(app)
        .put('/api/projects/1')
        .send({ description: '', startDate: null });

      expect(response.status).toBe(200);
      expect(response.body.project).toEqual(clearedProject);
      expect(mockDb.run).toHaveBeenCalledWith(
        'UPDATE projects SET description = ?, start_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?',
        [null, null, 1, 'test@example.com'],
        expect.any(Function)
      );
    });

    test('should verify client ownership when clientId changes', async () => {
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 2 }))
        .mockImplementationOnce((query, params, callback) => callback(null, { ...mockProject, client_id: 2 }));
      mockDb.run.mockImplementation(function(query, params, callback) {
        callback.call({ changes: 1 }, null);
      });

      const response = await request(app)
        .put('/api/projects/1')
        .send({ clientId: 2 });

      expect(response.status).toBe(200);
      expect(mockDb.get).toHaveBeenNthCalledWith(
        1,
        'SELECT id FROM clients WHERE id = ? AND user_email = ?',
        [2, 'test@example.com'],
        expect.any(Function)
      );
    });

    test('should return 404 when project not found', async () => {
      mockDb.run.mockImplementation(function(query, params, callback) {
        callback.call({ changes: 0 }, null);
      });

      const response = await request(app)
        .put('/api/projects/999')
        .send({ name: 'Updated' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Project not found' });
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    test('should return 400 for empty update body', async () => {
      const response = await request(app)
        .put('/api/projects/1')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Validation error' });
    });

    test('should return 400 for invalid project ID', async () => {
      const response = await request(app)
        .put('/api/projects/invalid')
        .send({ name: 'Updated' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid project ID' });
    });
  });

  describe('DELETE /api/projects/:id', () => {
    test('should delete project', async () => {
      mockDb.run.mockImplementation(function(query, params, callback) {
        callback.call({ changes: 1 }, null);
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

    test('should return 404 when project not found', async () => {
      mockDb.run.mockImplementation(function(query, params, callback) {
        callback.call({ changes: 0 }, null);
      });

      const response = await request(app).delete('/api/projects/999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Project not found' });
    });

    test('should return 400 for invalid project ID', async () => {
      const response = await request(app).delete('/api/projects/invalid');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid project ID' });
    });
  });

  describe('Database error handling', () => {
    const dbError = new Error('Database error');
    const okRun = (ctx) => function(query, params, callback) { callback.call(ctx, null); };

    test('GET /:id returns 500 on database error', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(dbError));

      const response = await request(app).get('/api/projects/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('POST returns 500 when client lookup fails', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(dbError));

      const response = await request(app).post('/api/projects').send({ name: 'P', clientId: 1 });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('POST returns 500 when insert fails', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 1 }));
      mockDb.run.mockImplementation((query, params, callback) => callback(dbError));

      const response = await request(app).post('/api/projects').send({ name: 'P', clientId: 1 });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to create project' });
    });

    test('POST returns 500 when reading created project fails', async () => {
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 1 }))
        .mockImplementationOnce((query, params, callback) => callback(dbError));
      mockDb.run.mockImplementation(okRun({ lastID: 1 }));

      const response = await request(app).post('/api/projects').send({ name: 'P', clientId: 1 });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Project created but failed to retrieve' });
    });

    test('PUT returns 500 when client lookup fails', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(dbError));

      const response = await request(app).put('/api/projects/1').send({ clientId: 2 });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('PUT returns 400 when new client does not belong to user', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, null));

      const response = await request(app).put('/api/projects/1').send({ clientId: 2 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Client not found or does not belong to user' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('PUT returns 500 when update fails', async () => {
      mockDb.run.mockImplementation((query, params, callback) => callback(dbError));

      const response = await request(app).put('/api/projects/1').send({ name: 'Updated' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to update project' });
    });

    test('PUT returns 500 when reading updated project fails', async () => {
      mockDb.run.mockImplementation(okRun({ changes: 1 }));
      mockDb.get.mockImplementation((query, params, callback) => callback(dbError));

      const response = await request(app).put('/api/projects/1').send({ name: 'Updated' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Project updated but failed to retrieve' });
    });

    test('DELETE returns 500 when delete fails', async () => {
      mockDb.run.mockImplementation((query, params, callback) => callback(dbError));

      const response = await request(app).delete('/api/projects/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to delete project' });
    });
  });
});
