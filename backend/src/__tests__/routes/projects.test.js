const request = require('supertest');
const express = require('express');
const projectRoutes = require('../../routes/projects');
const { getDatabase } = require('../../database/init');
const { errorHandler } = require('../../middleware/errorHandler');

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
app.use(errorHandler);

describe('Project Routes', () => {
  let mockDb;
  let consoleErrorSpy;

  const project = {
    id: 1,
    name: 'Website Redesign',
    description: 'New marketing site',
    client_id: 3,
    start_date: '2024-02-01',
    status: 'active',
    client_name: 'Acme',
    created_at: '2024-01-01',
    updated_at: '2024-01-01'
  };

  const validBody = {
    name: 'Website Redesign',
    description: 'New marketing site',
    clientId: 3,
    startDate: '2024-02-01',
    status: 'active'
  };

  beforeEach(() => {
    mockDb = {
      all: jest.fn(),
      get: jest.fn(),
      run: jest.fn()
    };
    getDatabase.mockReturnValue(mockDb);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('GET /api/projects', () => {
    test('returns projects scoped to the authenticated user', async () => {
      mockDb.all.mockImplementation((query, params, callback) => callback(null, [project]));

      const response = await request(app).get('/api/projects');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ projects: [project] });
      const [query, params] = mockDb.all.mock.calls[0];
      expect(query).toContain('p.user_email = ?');
      expect(params).toEqual(['test@example.com']);
    });

    test('filters by client and status with parameters', async () => {
      mockDb.all.mockImplementation((query, params, callback) => callback(null, []));

      const response = await request(app).get('/api/projects?clientId=3&status=completed');

      expect(response.status).toBe(200);
      const [query, params] = mockDb.all.mock.calls[0];
      expect(query).toContain('p.client_id = ?');
      expect(query).toContain('p.status = ?');
      expect(params).toEqual(['test@example.com', 3, 'completed']);
    });

    test('returns 400 for an invalid client filter', async () => {
      const response = await request(app).get('/api/projects?clientId=abc');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid client ID' });
      expect(mockDb.all).not.toHaveBeenCalled();
    });

    test('handles database errors', async () => {
      mockDb.all.mockImplementation((query, params, callback) => callback(new Error('boom')));

      const response = await request(app).get('/api/projects');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('GET /api/projects/:id', () => {
    test('returns the project', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, project));

      const response = await request(app).get('/api/projects/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ project });
      expect(mockDb.get.mock.calls[0][1]).toEqual([1, 'test@example.com']);
    });

    test('returns 404 when the project does not exist', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, undefined));

      const response = await request(app).get('/api/projects/999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Project not found' });
    });

    test('returns 400 for an invalid id', async () => {
      const response = await request(app).get('/api/projects/abc');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid project ID' });
    });

    test('handles database errors', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(new Error('boom')));

      const response = await request(app).get('/api/projects/1');

      expect(response.status).toBe(500);
    });
  });

  describe('POST /api/projects', () => {
    test('creates a project for a client the user owns', async () => {
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 3 }))
        .mockImplementationOnce((query, params, callback) => callback(null, project));
      mockDb.run.mockImplementation(function(query, params, callback) {
        callback.call({ lastID: 1 }, null);
      });

      const response = await request(app).post('/api/projects').send(validBody);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ message: 'Project created successfully', project });
      expect(mockDb.get.mock.calls[0][1]).toEqual([3, 'test@example.com']);
      expect(mockDb.run.mock.calls[0][1]).toEqual([
        'Website Redesign', 'New marketing site', 3, '2024-02-01', 'active', 'test@example.com'
      ]);
    });

    test('defaults status to active and description to null', async () => {
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 3 }))
        .mockImplementationOnce((query, params, callback) => callback(null, project));
      mockDb.run.mockImplementation(function(query, params, callback) {
        callback.call({ lastID: 1 }, null);
      });

      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'Minimal', clientId: 3, startDate: '2024-02-01' });

      expect(response.status).toBe(201);
      expect(mockDb.run.mock.calls[0][1]).toEqual([
        'Minimal', null, 3, '2024-02-01', 'active', 'test@example.com'
      ]);
    });

    test('rejects a client the user does not own', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, undefined));

      const response = await request(app).post('/api/projects').send(validBody);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Client not found or does not belong to user' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test.each([
      ['missing name', { ...validBody, name: undefined }],
      ['empty name', { ...validBody, name: '   ' }],
      ['name over 255 characters', { ...validBody, name: 'a'.repeat(256) }],
      ['missing client', { ...validBody, clientId: undefined }],
      ['missing start date', { ...validBody, startDate: undefined }],
      ['invalid start date', { ...validBody, startDate: 'not-a-date' }],
      ['unknown status', { ...validBody, status: 'archived' }]
    ])('returns 400 for %s', async (label, body) => {
      const response = await request(app).post('/api/projects').send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    test('handles insert errors', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 3 }));
      mockDb.run.mockImplementation((query, params, callback) => callback(new Error('boom')));

      const response = await request(app).post('/api/projects').send(validBody);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to create project' });
    });
  });

  describe('PUT /api/projects/:id', () => {
    test('updates status only', async () => {
      const updated = { ...project, status: 'completed' };
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 1 }))
        .mockImplementationOnce((query, params, callback) => callback(null, updated));
      mockDb.run.mockImplementation((query, params, callback) => callback(null));

      const response = await request(app).put('/api/projects/1').send({ status: 'completed' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Project updated successfully', project: updated });
      const [query, params] = mockDb.run.mock.calls[0];
      expect(query).toBe('UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?');
      expect(params).toEqual(['completed', 1, 'test@example.com']);
    });

    test('checks ownership of a new client before updating', async () => {
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 1 }))
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 4 }))
        .mockImplementationOnce((query, params, callback) => callback(null, project));
      mockDb.run.mockImplementation((query, params, callback) => callback(null));

      const response = await request(app)
        .put('/api/projects/1')
        .send({ clientId: 4, startDate: '2024-03-15', name: 'Renamed', description: '' });

      expect(response.status).toBe(200);
      expect(mockDb.get.mock.calls[1][1]).toEqual([4, 'test@example.com']);
      expect(mockDb.run.mock.calls[0][1]).toEqual(['Renamed', null, 4, '2024-03-15', 1, 'test@example.com']);
    });

    test('rejects moving a project to a client the user does not own', async () => {
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 1 }))
        .mockImplementationOnce((query, params, callback) => callback(null, undefined));

      const response = await request(app).put('/api/projects/1').send({ clientId: 99 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Client not found or does not belong to user' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('returns 404 when the project does not exist', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, undefined));

      const response = await request(app).put('/api/projects/999').send({ status: 'completed' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Project not found' });
    });

    test('returns 400 for an empty body', async () => {
      const response = await request(app).put('/api/projects/1').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
    });

    test('returns 400 for an invalid id', async () => {
      const response = await request(app).put('/api/projects/abc').send({ status: 'completed' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid project ID' });
    });

    test('handles update errors', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 1 }));
      mockDb.run.mockImplementation((query, params, callback) => callback(new Error('boom')));

      const response = await request(app).put('/api/projects/1').send({ status: 'on-hold' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to update project' });
    });
  });

  describe('DELETE /api/projects/:id', () => {
    test('deletes a project the user owns', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 1 }));
      mockDb.run.mockImplementation((query, params, callback) => callback(null));

      const response = await request(app).delete('/api/projects/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Project deleted successfully' });
      expect(mockDb.run.mock.calls[0]).toEqual([
        'DELETE FROM projects WHERE id = ? AND user_email = ?',
        [1, 'test@example.com'],
        expect.any(Function)
      ]);
    });

    test('returns 404 when the project does not exist', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, undefined));

      const response = await request(app).delete('/api/projects/999');

      expect(response.status).toBe(404);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('returns 400 for an invalid id', async () => {
      const response = await request(app).delete('/api/projects/abc');

      expect(response.status).toBe(400);
    });

    test('handles delete errors', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 1 }));
      mockDb.run.mockImplementation((query, params, callback) => callback(new Error('boom')));

      const response = await request(app).delete('/api/projects/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to delete project' });
    });
  });

  describe('POST /api/projects - error handling', () => {
    test('returns 500 and does not insert when the client lookup fails', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => callback(new Error('boom')));

      const response = await request(app).post('/api/projects').send(validBody);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('returns 500 when the created project cannot be retrieved', async () => {
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 3 }))
        .mockImplementationOnce((query, params, callback) => callback(new Error('boom')));
      mockDb.run.mockImplementation(function(query, params, callback) {
        callback.call({ lastID: 42 }, null);
      });

      const response = await request(app).post('/api/projects').send(validBody);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Project created but failed to retrieve' });
      expect(mockDb.get.mock.calls[1][1]).toEqual([42, 'test@example.com']);
    });

    test('passes unexpected synchronous errors to the error handler', async () => {
      getDatabase.mockImplementation(() => { throw new Error('Database unavailable'); });

      const response = await request(app).post('/api/projects').send(validBody);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Database unavailable' });
    });
  });

  describe('PUT /api/projects/:id - error handling and validation', () => {
    test('scopes the existence check to the authenticated user', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => callback(null, undefined));

      const response = await request(app).put('/api/projects/5').send({ status: 'completed' });

      expect(response.status).toBe(404);
      expect(mockDb.get.mock.calls[0][0]).toBe('SELECT id FROM projects WHERE id = ? AND user_email = ?');
      expect(mockDb.get.mock.calls[0][1]).toEqual([5, 'test@example.com']);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('returns 500 when the existence check fails', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => callback(new Error('boom')));

      const response = await request(app).put('/api/projects/1').send({ status: 'completed' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('returns 500 when the new client lookup fails', async () => {
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 1 }))
        .mockImplementationOnce((query, params, callback) => callback(new Error('boom')));

      const response = await request(app).put('/api/projects/1').send({ clientId: 4 });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
      expect(mockDb.get.mock.calls[1][1]).toEqual([4, 'test@example.com']);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('returns 500 when the updated project cannot be retrieved', async () => {
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 1 }))
        .mockImplementationOnce((query, params, callback) => callback(new Error('boom')));
      mockDb.run.mockImplementation((query, params, callback) => callback(null));

      const response = await request(app).put('/api/projects/1').send({ name: 'Renamed' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Project updated but failed to retrieve' });
      expect(mockDb.get.mock.calls[1][1]).toEqual([1, 'test@example.com']);
    });

    test.each([
      ['unknown status', { status: 'archived' }],
      ['invalid start date', { startDate: 'not-a-date' }],
      ['non-numeric client', { clientId: 'abc' }],
      ['empty name', { name: '   ' }]
    ])('returns 400 for %s', async (label, body) => {
      const response = await request(app).put('/api/projects/1').send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    test('passes unexpected synchronous errors to the error handler', async () => {
      getDatabase.mockImplementation(() => { throw new Error('Database unavailable'); });

      const response = await request(app).put('/api/projects/1').send({ status: 'completed' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Database unavailable' });
    });
  });

  describe('DELETE /api/projects/:id - error handling', () => {
    test('returns 500 and does not delete when the existence check fails', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => callback(new Error('boom')));

      const response = await request(app).delete('/api/projects/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('scopes the existence check to the authenticated user', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => callback(null, undefined));

      const response = await request(app).delete('/api/projects/8');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Project not found' });
      expect(mockDb.get.mock.calls[0][1]).toEqual([8, 'test@example.com']);
    });
  });
});
