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

const sampleProject = {
  id: 1,
  name: 'Website Redesign',
  description: 'Marketing site',
  client_id: 1,
  user_email: 'test@example.com',
  client_name: 'Client A',
  created_at: '2024-01-01',
  updated_at: '2024-01-01'
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
        callback(null, [sampleProject]);
      });

      const response = await request(app).get('/api/projects');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ projects: [sampleProject] });
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('WHERE p.user_email = ?'),
        ['test@example.com'],
        expect.any(Function)
      );
    });

    test('should filter by client ID when provided', async () => {
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, []);
      });

      await request(app).get('/api/projects?clientId=2');

      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('AND p.client_id = ?'),
        ['test@example.com', 2],
        expect.any(Function)
      );
    });

    test('should return 400 for invalid client ID filter', async () => {
      const response = await request(app).get('/api/projects?clientId=abc');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid client ID' });
    });

    test('should handle database error', async () => {
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'));
      });

      const response = await request(app).get('/api/projects');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('GET /api/projects/:id', () => {
    test('should return specific project scoped to user', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        expect(params).toEqual([1, 'test@example.com']);
        callback(null, sampleProject);
      });

      const response = await request(app).get('/api/projects/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ project: sampleProject });
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
        callback(new Error('Database error'));
      });

      const response = await request(app).get('/api/projects/1');

      expect(response.status).toBe(500);
    });
  });

  describe('POST /api/projects', () => {
    test('should create project with valid data', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('FROM clients')) {
          callback(null, { id: 1 });
        } else {
          callback(null, sampleProject);
        }
      });

      mockDb.run.mockImplementation(function(query, params, callback) {
        expect(query).toContain('INSERT INTO projects (name, description, client_id, user_email)');
        expect(params).toEqual(['Website Redesign', 'Marketing site', 1, 'test@example.com']);
        this.lastID = 1;
        callback.call(this, null);
      });

      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'Website Redesign', description: 'Marketing site', clientId: 1 });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        message: 'Project created successfully',
        project: sampleProject
      });
    });

    test('should store null description when empty', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation(function(query, params, callback) {
        expect(params[1]).toBeNull();
        this.lastID = 1;
        callback.call(this, null);
      });

      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'Bare', clientId: 1 });

      expect(response.status).toBe(201);
    });

    test('should return 400 if client not found', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null);
      });

      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'Orphan', clientId: 999 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Client not found' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('should return 400 for missing name', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({ clientId: 1 });

      expect(response.status).toBe(400);
    });

    test('should return 400 for missing clientId', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'No client' });

      expect(response.status).toBe(400);
    });

    test('should handle database error on insert', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(new Error('Insert failed'));
      });

      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'Broken', clientId: 1 });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to create project' });
    });

    test('should handle error retrieving project after creation', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('FROM clients')) {
          callback(null, { id: 1 });
        } else {
          callback(new Error('Fetch failed'));
        }
      });

      mockDb.run.mockImplementation(function(query, params, callback) {
        this.lastID = 1;
        callback.call(this, null);
      });

      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'Website Redesign', clientId: 1 });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Project created but failed to retrieve' });
    });
  });

  describe('PUT /api/projects/:id', () => {
    test('should update project name and description', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('FROM projects WHERE id = ? AND user_email = ?')) {
          callback(null, { id: 1 });
        } else {
          callback(null, { ...sampleProject, name: 'Renamed' });
        }
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        expect(query).toContain('UPDATE projects SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?');
        expect(params).toEqual(['Renamed', 'New desc', 1, 'test@example.com']);
        callback(null);
      });

      const response = await request(app)
        .put('/api/projects/1')
        .send({ name: 'Renamed', description: 'New desc' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Project updated successfully');
      expect(response.body.project.name).toBe('Renamed');
    });

    test('should verify client when changing clientId', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('FROM clients')) {
          expect(params).toEqual([2]);
          callback(null, { id: 2 });
        } else {
          callback(null, sampleProject);
        }
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        expect(query).toContain('client_id = ?');
        callback(null);
      });

      const response = await request(app)
        .put('/api/projects/1')
        .send({ clientId: 2 });

      expect(response.status).toBe(200);
    });

    test('should return 400 if new client not found', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('FROM clients')) {
          callback(null, null);
        } else {
          callback(null, { id: 1 });
        }
      });

      const response = await request(app)
        .put('/api/projects/1')
        .send({ clientId: 999 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Client not found' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('should return 404 if project not found', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null);
      });

      const response = await request(app)
        .put('/api/projects/999')
        .send({ name: 'Nope' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Project not found' });
    });

    test('should return 400 for invalid project ID', async () => {
      const response = await request(app)
        .put('/api/projects/invalid')
        .send({ name: 'Nope' });

      expect(response.status).toBe(400);
    });

    test('should return 400 for empty update', async () => {
      const response = await request(app)
        .put('/api/projects/1')
        .send({});

      expect(response.status).toBe(400);
    });

    test('should handle database error during update', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(new Error('Update failed'));
      });

      const response = await request(app)
        .put('/api/projects/1')
        .send({ name: 'Renamed' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to update project' });
    });
  });

  describe('DELETE /api/projects/:id', () => {
    test('should delete project with no work entries', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('COUNT(*)')) {
          callback(null, { count: 0 });
        } else {
          callback(null, { id: 1 });
        }
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        expect(query).toBe('DELETE FROM projects WHERE id = ? AND user_email = ?');
        expect(params).toEqual([1, 'test@example.com']);
        callback(null);
      });

      const response = await request(app).delete('/api/projects/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Project deleted successfully' });
    });

    test('should return 409 if project has work entries', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('COUNT(*)')) {
          callback(null, { count: 3 });
        } else {
          callback(null, { id: 1 });
        }
      });

      const response = await request(app).delete('/api/projects/1');

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: 'Project has work entries and cannot be deleted' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('should return 409 when the database enforces the foreign key', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('COUNT(*)')) {
          callback(null, { count: 0 });
        } else {
          callback(null, { id: 1 });
        }
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        const err = new Error('SQLITE_CONSTRAINT: FOREIGN KEY constraint failed');
        err.code = 'SQLITE_CONSTRAINT';
        callback(err);
      });

      const response = await request(app).delete('/api/projects/1');

      expect(response.status).toBe(409);
    });

    test('should return 404 if project not found', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null);
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

    test('should handle database delete error', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('COUNT(*)')) {
          callback(null, { count: 0 });
        } else {
          callback(null, { id: 1 });
        }
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
